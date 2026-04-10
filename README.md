# 🗳️ Mulembe Nation University — Online Voting System

A secure, real-time, and visually stunning online voting platform built for university guild elections. This system features a "Midnight Violet" aesthetic, real-time analytics, and robust security.

---

## 🚀 Features

### 🗳️ Voter Portal
- **Secure Identification**: Verify identity via Admission Number or University Email.
- **Live Search**: Quickly find candidates in a high-stakes election.
- **Passport-Style Portraits**: Large, clear candidate images with tap-to-zoom functionality.
- **Offline Resilience**: Cast votes even with a spotty connection; the system syncs automatically when back online.
- **Visual Confirmation**: Subtle success toasts and visual persistence of your choice after voting.

### 📊 Admin Dashboard (The War Room)
- **Live Analytics**: Real-time vote tallies, faculty distribution, and voting pace charts.
- **Election Control**: Manage election status (Live, Paused, Ended) and time windows.
- **Candidate Management**: Add, edit, and delete candidates with manifesto and image support.
- **Voter Management**: Bulk import eligible voters and monitor turnout.
- **Status Heartbeat**: Animated indicators for real-time election state monitoring.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS.
- **Backend**: Node.js, Express.js (serving as a secure API proxy).
- **Database**: Firebase Firestore (Real-time NoSQL).
- **Authentication**: Firebase Auth (Admin access).
- **Animations**: Framer Motion (`motion/react`).
- **Charts**: Recharts.
- **Icons**: Lucide React.

---

## 📁 Project Structure

- `/src/components`: Reusable UI components (Dashboard, VotingFlow, etc.).
- `/src/lib`: Firebase configuration and utility functions.
- `/server.ts`: Express server handling API routes and static file serving.
- `/firestore.rules`: Security rules for database protection.
- `/firebase-blueprint.json`: Data structure definition.

---

## 🔐 Security

- **Atomic Voting**: Server-side logic ensures each student can only vote once.
- **Anonymity**: Ballots are recorded without direct links to voter identities.
- **RBAC**: Strict Firestore rules ensure only authorized admins can modify election data.
- **Validation**: Comprehensive input validation on both client and server.

---

## 📖 Development Log

For a detailed step-by-step breakdown of how this application was built, please refer to the [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md) file.

---

## 📄 License

© 2026 Mulembe Nation University. All rights reserved.
