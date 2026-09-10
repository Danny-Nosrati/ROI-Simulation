document.addEventListener('DOMContentLoaded', () => {

    // ===== APPLICATION STATE =====
    const STATE = {
        // Config (from Collect page)
        product: 'chocolate',
        lineSpeed: 100,    // parts per minute
        hoursPerDay: 12,
        marginPerItem: 0.50,

        // Simulation internals
        isRunning: false,
        batchCols: 4,
        batchRows: 3,
        speed: 2.5,           // px per frame at 60fps baseline (visual belt speed)

        // Live counters
        visualMissing: 0,

        // Timing — wall-clock based (frame-rate independent)
        simStartTime: 0,      // performance.now() when sim started
        lastFrameTime: 0,     // for delta-time belt movement

        // Downtime
        isDowntimeActive: false,
        downtimeEndTime: 0,   // wall-clock time when downtime ends

        // Changeover
        isChangeoverActive: false,
        changeoverEndTime: 0,

        // Maintenance
        isMaintenanceActive: false,
        maintenanceEndTime: 0,

        // Event cycle: downtime → changeover → break → repeat (every 10s)
        lastEventTime: 0,
        eventCycleIndex: 0,  // 0=downtime, 1=changeover, 2=break

        // Belt
        scannerY: 0,
        trays: [],
        lastTrayY: 0
    };

    // Image paths for products
    const PRODUCT_IMAGES = {
        chocolate: 'images/chocolate.png',
        bread: 'images/bread.png',
        bun: 'images/bun.png',
        patty: 'images/patty.png',
        cookie: 'images/cookie.png',
        tortilla: 'images/tortilla.png'
    };

    // Calculate actual tray height to match CSS rendering
    // CSS: tray width=360px, padding=12px each side, gap=8px
    function getTrayHeight() {
        const TRAY_WIDTH = 360;
        const TRAY_PADDING = 12;
        const TRAY_GAP = 8;
        const availableWidth = TRAY_WIDTH - (TRAY_PADDING * 2);
        const itemWidth = (availableWidth - (STATE.batchCols - 1) * TRAY_GAP) / STATE.batchCols;
        const itemHeight = itemWidth; // aspect-ratio 1:1
        return (STATE.batchRows * itemHeight) + ((STATE.batchRows - 1) * TRAY_GAP) + (TRAY_PADDING * 2) + 4; // +4 for border
    }

    function getTraySpacing() {
        return getTrayHeight() + 40;
    }

    // ===== DOM ELEMENTS =====
    const el = {
        pageCollect: document.getElementById('page-collect'),
        pageShow: document.getElementById('page-show'),

        // Collect page
        productGrid: document.getElementById('product-grid'),
        rngSpeed: document.getElementById('rng-speed'),
        lblSpeed: document.getElementById('lbl-speed'),
        rngHours: document.getElementById('rng-hours'),
        lblHours: document.getElementById('lbl-hours'),
        rngMargin: document.getElementById('rng-margin'),
        lblMargin: document.getElementById('lbl-margin'),
        btnRun: document.getElementById('btn-run'),

        // Show page
        beltTexture: document.querySelector('.belt-texture'),
        beltContainer: document.getElementById('belt'),
        scannerZone: document.getElementById('scanner-zone'),
        downtimeOverlay: document.getElementById('downtime-overlay'),
        maintenanceOverlay: document.getElementById('maintenance-overlay'),
        statusBadge: document.getElementById('status-badge'),
        btnBack: document.getElementById('btn-back'),

        // Live metrics
        liveMissing: document.getElementById('live-missing'),
        liveDowntime: document.getElementById('live-downtime'),
        liveValueLost: document.getElementById('live-value-lost'),

        // Annual metrics
        annualMissing: document.getElementById('annual-missing'),
        annualDowntime: document.getElementById('annual-downtime'),
        annualLoss: document.getElementById('annual-loss'),

        // Clock & Stats
        clockHand: document.getElementById('clock-hand'),
        changeoverOverlay: document.getElementById('changeover-overlay'),
        
        // CTA
        ctaPopup: document.getElementById('fabrisight-cta'),
        ctaClose: document.getElementById('cta-close')
    };

    // ===== COLLECT PAGE LOGIC =====
    // Product selection
    el.productGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (!card) return;
        el.productGrid.querySelectorAll('.product-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        STATE.product = card.dataset.product;
    });

    // Sliders
    el.rngSpeed.addEventListener('input', (e) => {
        STATE.lineSpeed = parseInt(e.target.value);
        el.lblSpeed.textContent = STATE.lineSpeed + ' ppm';
    });

    el.rngHours.addEventListener('input', (e) => {
        STATE.hoursPerDay = parseInt(e.target.value);
        el.lblHours.textContent = STATE.hoursPerDay + 'h';
    });

    el.rngMargin.addEventListener('input', (e) => {
        STATE.marginPerItem = parseFloat(e.target.value);
        el.lblMargin.textContent = '$' + STATE.marginPerItem.toFixed(2);
    });

    // Run button
    el.btnRun.addEventListener('click', () => {
        startSimulation();
    });

    // Back button
    el.btnBack.addEventListener('click', () => {
        stopSimulation();
        el.pageShow.classList.remove('active');
        el.pageCollect.classList.add('active');
        if(el.ctaPopup) el.ctaPopup.classList.add('hidden');
    });

    if (el.ctaClose) {
        el.ctaClose.addEventListener('click', () => {
            el.ctaPopup.classList.add('hidden');
        });
    }

    function startSimulation() {
        // Fixed 4x3 tray
        STATE.batchCols = 4;
        STATE.batchRows = 3;

        // Switch pages
        el.pageCollect.classList.remove('active');
        el.pageShow.classList.add('active');

        // Reset state
        STATE.isRunning = true;
        STATE.visualMissing = 0;
        STATE.isDowntimeActive = false;
        STATE.isChangeoverActive = false;
        STATE.isMaintenanceActive = false;

        // Wall-clock timing
        const now = performance.now();
        STATE.simStartTime = now;
        STATE.lastFrameTime = now;
        STATE.lastEventTime = now;
        STATE.eventCycleIndex = 0;

        // Scale visual belt speed based on line speed
        // 20 ppm → 60 px/s, 100 ppm → 150 px/s, 600 ppm → 480 px/s
        STATE.speed = 60 + (STATE.lineSpeed - 20) * (480 - 60) / (600 - 20);

        // Update belt texture animation speed to mathematically synchronize with item px/s
        // Background stripes repeat every 60px. Speed = px/sec. Duration = distance/speed.
        const beltAnimDuration = 60 / STATE.speed;
        el.beltTexture.style.animationDuration = beltAnimDuration + 's';

        el.downtimeOverlay.classList.add('hidden');
        el.maintenanceOverlay.classList.add('hidden');
        el.changeoverOverlay.classList.add('hidden');
        el.beltTexture.classList.add('running');

        el.statusBadge.className = 'status-badge live';
        el.statusBadge.textContent = 'System Online';

        // Clear existing trays
        STATE.trays.forEach(t => t.element.remove());
        STATE.trays = [];
        STATE.lastTrayY = 0;

        // Calculate annual projection
        calculateAnnualProjection();
        updateLiveMetrics();

        // Update scanner position
        setTimeout(() => {
            updateScannerPosition();
            spawnInitialTrays();
            requestAnimationFrame(gameLoop);
        }, 100);

        // FabriSight CTA
        setTimeout(() => {
            if (STATE.isRunning && el.ctaPopup) {
                el.ctaPopup.classList.remove('hidden');
            }
        }, 17000); // 17 seconds pop up
    }

    function stopSimulation() {
        STATE.isRunning = false;
        STATE.trays.forEach(t => t.element.remove());
        STATE.trays = [];
    }

    // ===== SCANNER POSITION =====
    function updateScannerPosition() {
        const rect = el.scannerZone.getBoundingClientRect();
        const beltRect = el.beltContainer.getBoundingClientRect();
        STATE.scannerY = (rect.top - beltRect.top) + (rect.height / 2);
    }
    window.addEventListener('resize', updateScannerPosition);

    // ===== ANNUAL PROJECTION =====
    function calculateAnnualProjection() {
        const ppm = STATE.lineSpeed;
        const hoursPerDay = STATE.hoursPerDay;
        const marginPerItem = STATE.marginPerItem;
        const operatingDays = 365;

        // Formula: Annual Max Units = Line Speed (items/min) × 60 × Hours per Day × Operating Days
        const annualMaxUnits = ppm * 60 * hoursPerDay * operatingDays;

        // Est. Units Missed: Annual Max Units × 20%
        const estUnitsMissed = annualMaxUnits * 0.20;

        // Est. Downtime (Hours): (Hours per Day × Operating Days) × 15%
        const estDowntimeHours = (hoursPerDay * operatingDays) * 0.15;

        // Est. $ Loss: Annual Max Units × Total Error % (40%) × Margin per Item
        const estLoss = annualMaxUnits * 0.40 * marginPerItem;

        el.annualMissing.textContent = formatLargeNumber(Math.floor(estUnitsMissed));
        el.annualDowntime.textContent = Math.floor(estDowntimeHours).toLocaleString('en-US') + ' hrs';
        el.annualLoss.textContent = formatDollar(estLoss);
    }

    // ===== FORMATTING =====
    function formatDollar(amount) {
        if (amount >= 100_000_000) return '$100M+';
        return '$' + Math.round(amount).toLocaleString('en-US');
    }

    function formatLargeNumber(num) {
        if (num >= 100_000_000) return '100M+';
        return num.toLocaleString('en-US');
    }

    function updateLiveMetrics() {
        // Wall-clock based: 1 real second = 1 sim minute
        const elapsedMs = performance.now() - STATE.simStartTime;
        const elapsedSeconds = elapsedMs / 1000;
        const elapsedMinutes = elapsedSeconds; // 1 real second = 1 sim minute
        const accumulatedItems = elapsedMinutes * STATE.lineSpeed;

        // Running Loss formulas (pure mathematical projection)
        const liveMissingCount = Math.floor(accumulatedItems * 0.20);
        const liveDowntimeSeconds = elapsedMinutes * 60 * 0.15;
        const liveTotalLoss = accumulatedItems * 0.40 * STATE.marginPerItem;

        el.liveMissing.textContent = liveMissingCount.toLocaleString('en-US');
        el.liveDowntime.textContent = Math.round(liveDowntimeSeconds) + 's';
        el.liveValueLost.textContent = formatDollar(liveTotalLoss);

        // Clock hand: 1 full revolution per real second (= 1 sim minute)
        // Use fractional seconds for smooth continuous rotation
        const clockDegrees = (elapsedSeconds % 1) * 360;
        if (el.clockHand) {
            el.clockHand.style.transform = `translateX(-50%) rotate(${clockDegrees}deg)`;
        }
    }

    // ===== TRAY CREATION =====
    function createTray() {
        const trayDiv = document.createElement('div');
        trayDiv.className = 'tray';
        trayDiv.style.setProperty('--cols', STATE.batchCols);
        trayDiv.style.setProperty('--rows', STATE.batchRows);

        const totalItems = STATE.batchCols * STATE.batchRows;
        const slots = [];

        const missingChance = 0.40; // Visually show 40% missing to match total loss expectation

        for (let i = 0; i < totalItems; i++) {
            const slot = document.createElement('div');
            slot.className = 'product-slot';
            const isMissing = Math.random() < missingChance;

            if (isMissing) {
                slot.classList.add('missing');
            } else {
                slot.classList.add('present');
                const p = document.createElement('div');
                p.className = 'product-item';
                const img = document.createElement('img');
                img.src = PRODUCT_IMAGES[STATE.product];
                img.alt = STATE.product;
                img.draggable = false;
                p.appendChild(img);
                slot.appendChild(p);
            }

            trayDiv.appendChild(slot);
            slots.push({ element: slot, isMissing });
        }

        el.beltContainer.appendChild(trayDiv);

        return {
            element: trayDiv,
            y: -getTrayHeight() - 50,
            slots,
            scanned: false
        };
    }

    function spawnInitialTrays() {
        let spawnY = -getTrayHeight() - 50;
        for (let i = 0; i < 4; i++) {
            const tray = createTray();
            tray.y = spawnY;
            tray.element.style.transform = `translate(-50%, ${tray.y}px)`;
            STATE.trays.push(tray);
            spawnY -= getTraySpacing();
        }
        STATE.lastTrayY = spawnY;
    }

    function fillTrays() {
        if (STATE.lastTrayY > -getTrayHeight() - 50) {
            const tray = createTray();
            tray.y = STATE.lastTrayY - getTraySpacing();
            tray.element.style.transform = `translate(-50%, ${tray.y}px)`;
            STATE.trays.push(tray);
            STATE.lastTrayY = tray.y;
        }
    }

    // ===== SCANNING =====
    function scanTray(tray) {
        tray.scanned = true;
        tray.element.classList.add('scanned');

        let visualDefects = 0;

        tray.slots.forEach(slotData => {
            slotData.element.classList.add('scanned');
            if (slotData.isMissing) {
                visualDefects++;
            }
        });

        // Visual count: exact number of missing slots you can see
        STATE.visualMissing += visualDefects;

        // Financial loss tracking is handled continuously by formulas now
        // This visual defect scanning is just for the belt's scan pulse effect
        updateLiveMetrics();

        // Scanner pulse
        el.scannerZone.style.boxShadow = '0 0 40px rgba(59, 130, 246, 0.4) inset';
        setTimeout(() => {
            el.scannerZone.style.boxShadow = 'none';
        }, 150);
    }

    // ===== DOWNTIME =====
    function triggerDowntime() {
        STATE.isDowntimeActive = true;

        // Downtime lasts 1.5-2.5 real seconds
        STATE.downtimeEndTime = performance.now() + 1500 + Math.random() * 1000;

        el.downtimeOverlay.classList.remove('hidden');
        el.beltTexture.classList.remove('running');

        el.statusBadge.className = 'status-badge downtime';
        el.statusBadge.textContent = 'Downtime Detected';

        updateLiveMetrics();
    }

    // ===== CHANGEOVER =====
    function triggerChangeover() {
        STATE.isChangeoverActive = true;

        // Changeover lasts 1.5 real seconds
        STATE.changeoverEndTime = performance.now() + 1500;

        // Immediately empty the closest visible tray on the belt
        const beltHeight = el.beltContainer.clientHeight || 500;
        let closestTray = null;
        let closestDist = Infinity;
        STATE.trays.forEach(tray => {
            const trayCenterY = tray.y + getTrayHeight() / 2;
            // Only consider trays that are visible on screen
            if (trayCenterY > 0 && trayCenterY < beltHeight) {
                const dist = Math.abs(trayCenterY - beltHeight * 0.4);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestTray = tray;
                }
            }
        });

        if (closestTray) {
            closestTray.slots.forEach(slotData => {
                if (!slotData.isMissing) {
                    slotData.isMissing = true;
                    slotData.element.classList.remove('present');
                    slotData.element.classList.add('missing');
                    // Remove the product image
                    const productItem = slotData.element.querySelector('.product-item');
                    if (productItem) productItem.remove();
                }
            });
        }

        el.changeoverOverlay.classList.remove('hidden');
        el.beltTexture.classList.remove('running');

        el.statusBadge.className = 'status-badge downtime';
        el.statusBadge.textContent = 'Change Over Active';

        updateLiveMetrics();
    }

    // ===== GAME LOOP =====
    function gameLoop() {
        if (!STATE.isRunning) return;

        const now = performance.now();
        const deltaMs = now - STATE.lastFrameTime;
        const deltaSec = deltaMs / 1000;
        STATE.lastFrameTime = now;

        // Always update metrics and clock (time-based, frame-rate independent)
        updateLiveMetrics();

        // Changeover
        if (STATE.isChangeoverActive) {
            if (now >= STATE.changeoverEndTime) {
                STATE.isChangeoverActive = false;
                el.changeoverOverlay.classList.add('hidden');
                el.beltTexture.classList.add('running');
                el.statusBadge.className = 'status-badge live';
                el.statusBadge.textContent = 'System Online';
            }
            return requestAnimationFrame(gameLoop);
        }

        // Downtime
        if (STATE.isDowntimeActive) {
            if (now >= STATE.downtimeEndTime) {
                STATE.isDowntimeActive = false;
                el.downtimeOverlay.classList.add('hidden');
                el.beltTexture.classList.add('running');
                el.statusBadge.className = 'status-badge live';
                el.statusBadge.textContent = 'System Online';
            }
            return requestAnimationFrame(gameLoop);
        }

        // Maintenance
        if (STATE.isMaintenanceActive) {
            if (now >= STATE.maintenanceEndTime) {
                STATE.isMaintenanceActive = false;
                el.maintenanceOverlay.classList.add('hidden');
                el.beltTexture.classList.add('running');
                el.statusBadge.className = 'status-badge live';
                el.statusBadge.textContent = 'System Online';
            }
            return requestAnimationFrame(gameLoop);
        }

        // Deterministic event cycle: every 10 seconds
        // Sequence: downtime → changeover → break → repeat
        // If 24h, skip break: downtime → changeover → repeat
        if (now - STATE.lastEventTime >= 10000) {
            STATE.lastEventTime = now;
            const cycle = STATE.hoursPerDay < 24
                ? ['downtime', 'changeover', 'break']
                : ['downtime', 'changeover'];
            const eventType = cycle[STATE.eventCycleIndex % cycle.length];
            STATE.eventCycleIndex++;

            if (eventType === 'downtime') {
                triggerDowntime();
                return requestAnimationFrame(gameLoop);
            } else if (eventType === 'changeover') {
                triggerChangeover();
                return requestAnimationFrame(gameLoop);
            } else {
                STATE.isMaintenanceActive = true;
                STATE.maintenanceEndTime = now + 2000;
                el.maintenanceOverlay.classList.remove('hidden');
                el.beltTexture.classList.remove('running');
                el.statusBadge.className = 'status-badge maintenance';
                el.statusBadge.textContent = 'Break Time';
                return requestAnimationFrame(gameLoop);
            }
        }

        // Move trays — delta-time based (frame-rate independent)
        const pxThisFrame = STATE.speed * deltaSec;
        let highestY = Infinity;
        STATE.trays.forEach(tray => {
            tray.y += pxThisFrame;
            tray.element.style.transform = `translate(-50%, ${tray.y}px)`;
            if (tray.y < highestY) highestY = tray.y;

            const trayCenterY = tray.y + (getTrayHeight() / 2);
            if (!tray.scanned && trayCenterY >= STATE.scannerY) {
                scanTray(tray);
            }
        });

        if (highestY === Infinity) highestY = -getTrayHeight() - 50;
        STATE.lastTrayY = highestY;

        // Cleanup
        const viewportHeight = el.beltContainer.clientHeight > 0 ? el.beltContainer.clientHeight + 100 : window.innerHeight;
        STATE.trays = STATE.trays.filter(tray => {
            if (tray.y > viewportHeight) {
                tray.element.remove();
                return false;
            }
            return true;
        });

        fillTrays();
        requestAnimationFrame(gameLoop);
    }
});
