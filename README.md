# 💧 AquaIQ — Smart Wastewater Treatment & Reuse Decision System

> *"A smart system that analyzes wastewater and applies only the necessary treatment to enable efficient, cost-effective, and sustainable water reuse."*

![Version](https://img.shields.io/badge/version-2.0-blue) ![Standard](https://img.shields.io/badge/standard-IS--10500%20%2F%20CPCB-teal) ![License](https://img.shields.io/badge/license-MIT-green) ![Status](https://img.shields.io/badge/status-Active-brightgreen)

---

## 📌 Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Solution](#solution)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [Input Parameters](#input-parameters)
- [Treatment Stages](#treatment-stages)
- [Reuse Classification](#reuse-classification)
- [Standards Reference](#standards-reference)
- [Future Scope](#future-scope)
- [Team](#team)

---

## Overview

**AquaIQ** is a web-based AI-powered decision system for smart wastewater treatment. It analyzes water quality parameters in real time, determines the minimum treatment stages required, estimates cost and energy usage, and recommends safe reuse applications — all powered by the Claude AI API.

Built for the **Smart Wastewater Treatment & Reuse System** hackathon problem statement, AquaIQ demonstrates how AI can replace manual, one-size-fits-all treatment decisions with intelligent, data-driven recommendations aligned to Indian national standards (IS-10500 / CPCB).

---

## Problem Statement

Fresh water is becoming critically scarce due to rising industrialization, urbanization, and population growth. Most industrial and domestic processes generate wastewater that is discharged without adequate treatment, leading to:

- Environmental pollution of rivers, lakes, and soil
- Wastage of water that could be safely reused
- Excessive treatment costs from over-engineering
- High energy consumption from unnecessary treatment stages

There is a critical need for a system that treats wastewater **efficiently**, minimizes pollution, enables **safe reuse**, and **optimizes cost and energy usage**.

---

## Solution

AquaIQ solves this with a three-layer approach:

```
Water Parameters → AI Decision Engine → Treatment Plan + Reuse Recommendation
```

Instead of applying all three treatment stages by default, AquaIQ analyzes the actual water quality and triggers **only the stages that are necessary** — reducing cost, energy, and chemical usage while still meeting safety standards.

---

## Features

| Feature | Description |
|---|---|
| 🔬 Live Parameter Analysis | Real-time contamination index updates as you adjust input sliders |
| 🤖 AI Decision Engine | Claude AI reasons over parameter combinations, not just individual thresholds |
| ⚙️ Smart Treatment Selection | Activates only Primary, Secondary, or Tertiary stages as needed |
| 💰 Cost & Energy Estimation | Estimates treatment cost (₹/kL) and energy consumption (kWh/kL) |
| ♻️ Reuse Classification | Recommends safe reuse — Potable, Industrial, Irrigation, or Restricted |
| 📊 Before vs After Charts | Visual comparison of parameter levels before and after treatment |
| 📋 Analysis History | Logs last 5 analyses with timestamp, source type, score, and class |
| 📄 Export Report | Download a plain-text summary of any analysis as a `.txt` file |
| 📱 Responsive Design | Fully functional on desktop, tablet, and mobile |
| ⚡ Quick Presets | One-click load of realistic sample scenarios for demo and testing |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      AquaIQ Frontend                     │
│                   React Single-Page App                  │
└───────────────┬─────────────────────────────────────────┘
                │
                │  User inputs: pH, Turbidity, TDS, BOD, Source
                ▼
┌─────────────────────────────────────────────────────────┐
│                   AI Decision Engine                      │
│              Claude API (claude-sonnet-4)                │
│                                                          │
│  System prompt includes:                                 │
│  - IS-10500 drinking water standards                     │
│  - CPCB discharge norms                                  │
│  - Treatment stage trigger logic                         │
│  - Cost and energy estimation models                     │
└───────────────┬─────────────────────────────────────────┘
                │
                │  Structured JSON response
                ▼
┌─────────────────────────────────────────────────────────┐
│                    Output Layer                           │
│                                                          │
│  - Quality Score (0–100)                                 │
│  - Treatment stages activated                            │
│  - Cost per kilolitre (₹/kL)                            │
│  - Energy consumption (kWh/kL)                           │
│  - Reuse classification                                  │
│  - Parameter status (PASS / WARN / FAIL)                 │
│  - Detailed AI narrative report                          │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (JSX, single-file component) |
| Styling | Tailwind CSS + custom CSS variables |
| AI Engine | Anthropic Claude API (`claude-sonnet-4`) |
| Charts | Chart.js (via CDN) |
| Fonts | Syne · Plus Jakarta Sans · JetBrains Mono |
| Standards | IS-10500 (India) · CPCB Discharge Norms |
| Deployment | Lovable / Vercel / Netlify |

---

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key ([get one here](https://console.anthropic.com))

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/aquaiq.git
cd aquaiq

# Install dependencies
npm install

# Add your API key
cp .env.example .env
# Edit .env and add: VITE_ANTHROPIC_API_KEY=your_key_here

# Start the development server
npm run dev
```

### Environment Variables

```env
VITE_ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

> ⚠️ Never commit your API key to version control. The `.env` file is gitignored by default.

---

## How It Works

### Step 1 — Enter Water Parameters
Input the four water quality readings using sliders or numeric fields. Select the wastewater source type. The Contamination Index updates live as you adjust values.

### Step 2 — Analyze Sample
Click **Analyze Sample**. AquaIQ sends the parameters to the Claude AI API with a system prompt that includes IS-10500 standards and CPCB norms.

### Step 3 — Review Decision
The AI returns:
- Which treatment stages are required
- An overall water quality score
- A reuse classification
- Cost and energy estimates
- A detailed explanation of why each stage was triggered

### Step 4 — Export or Log
Download the full analysis as a `.txt` report, or review past analyses in the history log below the dashboard.

---

## Input Parameters

| Parameter | Unit | Safe Range (IS-10500) | Description |
|---|---|---|---|
| pH Level | — | 6.5 – 8.5 | Acidity or alkalinity of water |
| Turbidity | NTU | ≤ 5 NTU | Suspended particle concentration |
| TDS | mg/L | ≤ 500 mg/L | Total Dissolved Solids |
| BOD | mg/L | ≤ 3 mg/L | Biological Oxygen Demand (organic load) |

### Quick Presets

| Preset | pH | Turbidity | TDS | BOD | Scenario |
|---|---|---|---|---|---|
| Severely Polluted | 4.5 | 450 | 1800 | 400 | Heavily contaminated industrial discharge |
| Industrial Effluent | 5.2 | 380 | 1650 | 320 | Typical factory wastewater |
| Greywater | 7.1 | 45 | 420 | 55 | Household sink/shower water |
| Near Clean | 7.2 | 8 | 180 | 5 | Lightly contaminated source |

---

## Treatment Stages

### Primary Treatment
**Trigger:** High turbidity (suspended solids present)
**Process:** Screening, sedimentation, coagulation-flocculation
**Removes:** Suspended solids, large particles, settleable matter

### Secondary Treatment
**Trigger:** High BOD (significant organic load)
**Process:** Activated Sludge Process (ASP), Moving Bed Biofilm Reactor (MBBR), biological oxidation
**Removes:** Dissolved organic matter, biological contaminants

### Tertiary Treatment
**Trigger:** High TDS or output quality requirements exceed secondary treatment capability
**Process:** Reverse Osmosis (RO), UV disinfection, fine filtration, activated carbon
**Removes:** Dissolved solids, trace contaminants, pathogens, color

> AquaIQ activates only the stages that are needed. If turbidity is within limits, Primary is skipped. If BOD is acceptable, Secondary is skipped. This is the core cost-optimization logic.

---

## Reuse Classification

| Class | Quality Score | Typical Use Cases |
|---|---|---|
| ✅ POTABLE | 85 – 100 | Drinking water (after tertiary treatment + disinfection) |
| 🔵 INDUSTRIAL | 60 – 84 | Cooling towers, boiler feed, process water |
| 🟡 IRRIGATION | 40 – 59 | Agricultural irrigation, landscaping, green belts |
| 🔴 RESTRICTED | 0 – 39 | Requires further treatment before any reuse |

---

## Standards Reference

AquaIQ validates all parameters against two Indian regulatory standards:

**IS-10500:2012** — Indian Standard for Drinking Water
Published by the Bureau of Indian Standards (BIS). Defines acceptable limits for physical, chemical, and biological parameters in potable water.

**CPCB Discharge Standards**
Published by the Central Pollution Control Board. Defines permissible limits for wastewater discharge into inland surface water, public sewers, and land.

---

## Future Scope

- **IoT Integration** — Direct connection to real-time sensor arrays at treatment plants, eliminating manual parameter entry
- **ML Predictive Maintenance** — Machine learning models that predict equipment failures and contamination events before they occur
- **Mobile Application** — Native iOS and Android app for field operators and plant managers
- **Multi-Source Analysis** — Simultaneous analysis of multiple inflow streams at large treatment facilities
- **Carbon Footprint Tracker** — Estimate and log CO₂ savings from optimized treatment decisions
- **Regulatory Reporting** — Auto-generate CPCB-compliant discharge reports from analysis history

---

## Team

Built for the Smart Wastewater Treatment & Reuse System Hackathon

| Name | Role |
|---|---|
| Pramegha | Team Lead · UI/UX Design |
| [Teammate 2] | Frontend Development |
| [Teammate 3] | AI Integration |
| [Teammate 4] | Research & Standards |

**Institution:** RNSIT, Bengaluru
**Event:** [Hackathon Name]
**Date:** April 2026

---

## License

This project is licensed under the MIT License. See `LICENSE` for details.

---

<div align="center">

**AquaIQ © 2026 — IS-10500 / CPCB Reference Standards**

*Built with ♻️ for a water-secure future*

</div>
