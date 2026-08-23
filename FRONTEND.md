# AgriTrust-Frontend Documentation

Next.js web application for the AgriTrust Protocol, providing a decentralized dashboard for agricultural trust fund management, milestone tracking, and yield treasury analytics.

## 🚀 Key Features
* **Trust Fund Dashboard:** Modern user interface for creating and managing trust funds and tracking participant status.
* **Milestone & Proof Tracking:** Interactive timeline to submit and verify milestone completion proofs.
* **Treasury Analytics:** Real-time visibility into yield-generating treasury positions and dispute resolution workflows.

## 🛠️ Tech Stack
* **Language/Framework:** Next.js (React) / TypeScript
* **Key Dependencies:** `next`, `react`, `tailwindcss`

## 📦 Getting Started

### Prerequisites
Ensure you have the required toolchains installed:
* Node.js (v18 or higher recommended)
* npm or pnpm (the onboarding script auto-detects the checked-in lockfile)

### Installation & Local Setup
```bash
# Clone the repository (if running manually)
git clone https://github.com/AgriTrust-Protocol/AgriTrust-Frontend
cd AgriTrust-Frontend

# Run the onboarding script. It verifies Node.js, creates .env.local from
# .env.example when needed, and installs dependencies with the detected package manager.
npm run setup:local

# Start development server
npm run dev
```

Use `npm run setup:local -- --skip-install` if dependencies are already installed. Use `npm run setup:local:check` before opening a PR to validate the setup plus lint and tests.

---

## 🧩 Component Guidelines

All components are built using React (Next.js) and TypeScript.

### Structure
- **Global Components**: Located in `src/components`, these are reusable components shared across the application.
- **Route-specific Components**: Located in `app/[route]/_components` (e.g. `app/dashboard/analytics/_components`).

### Best Practices
- **Single Responsibility Principle:** Each component should ideally do one thing.
- **Type Safety:** Define prop types explicitly using TypeScript interfaces.
- **Server vs Client Components:** Use Server Components by default. Add `"use client"` at the top of the file only when interactivity (hooks like `useState`, `useEffect`) is needed.

---

## 🎨 Styling Guidelines

We use **Tailwind CSS** for styling the frontend. 

### Principles
- **Utility-First:** Use Tailwind utility classes for layout, typography, and colors directly within component files.
- **Theming:** Global styles and variables are defined in the Tailwind configuration and root stylesheet.
- **Consistency:** Follow the predefined design system for spacing, colors, and typography to maintain visual consistency.

---

## 🚀 Deployment Instructions

### Standard Deployment
The application is optimized for deployment on Vercel, or any Node.js environment supporting Next.js.
1. Build the application: `npm run build`
2. Start the production server: `npm run start`

### Docker Deployment
A Dockerfile is provided for containerized deployments:
```bash
docker build -t agritrust-frontend .
docker run -p 3000:3000 agritrust-frontend
```

### Service Mesh Production Deployment
The production deployment uses Istio mutual TLS, identity-based authorization, canary/blue-green routing, and Prometheus/Grafana observability. See the [architecture](docs/architecture/service-mesh-mtls.md) and [operations runbook](docs/runbooks/service-mesh.md) before applying manifests.

---

## 🤝 Contributing
Contributions are highly welcome. Please ensure your commits are cryptographically signed using GPG or SSH keys. For major structural changes, please open an issue first to discuss your proposal.
