# ROI Simulation

An interactive production line ROI simulator built for [FabriSight](https://fabrisight.com). Users configure their production parameters and watch a real-time conveyor belt simulation that calculates lost revenue from downtime, changeovers, and missing product.

## Features

- **Product Selection:** Choose from 6 food manufacturing products (chocolate, bread, buns, patties, cookies, tortillas)
- **Configurable Parameters:** Adjust line speed (20–600 ppm), production hours (7–24h), and margin per item ($0.50–$50.00)
- **Live Conveyor Belt Simulation:** Animated belt with scanner zone, real-time defect detection visuals, and tray-based product flow
- **Downtime Events:** Simulates unplanned downtime, scheduled breaks, and changeover losses on a realistic cycle
- **Running Loss Dashboard:** Live counters for units missing, downtime accumulated, and dollar value lost
- **Annual Loss Projections:** Extrapolates simulation data to estimate yearly losses with industry average benchmarks
- **FabriSight CTA:** Contextual prompt showing how FabriSight can reclaim lost revenue

## Tech Stack

- Vanilla JavaScript (no frameworks)
- HTML5 / CSS3
- Express.js (for serving)

## Setup

```bash
npm install
```

Open `index.html` in your browser, or serve with a local dev server.

## How It Works

1. **Configure:** Select a product and set your line speed, production hours, and profit margin per item
2. **Run:** Hit "Run Simulation" to start the conveyor belt animation
3. **Watch:** The belt runs product trays past a scanner zone. Downtime, breaks, and changeover events trigger automatically on a cycle
4. **Analyze:** The dashboard on the right calculates running losses in real time and projects annual losses based on industry averages (20% missing, 15% downtime, 5% changeover)

## Built For

This tool was built as a sales engineering asset for **FabriSight**, a computer vision startup focused on AI-powered inspection for food manufacturing lines.
