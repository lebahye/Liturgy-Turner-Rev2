# Armenian Liturgy Turner

## Overview

This is an Armenian Liturgy Page Turner application that automatically follows along with liturgical services and turns pages in sync with live audio. The system uses audio fingerprinting and speech recognition to match what's being sung/spoken to the correct page in a PDF liturgy document.

The application has three main modes:
- **Training Mode**: Record audio while manually marking page transitions to build audio fingerprints
- **Live Mode**: Listen to microphone input and automatically turn pages based on trained audio patterns and speech recognition
- **Display Mode**: Full-screen PDF viewer for projection/display purposes

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React 18** with TypeScript
- **Vite** as the build tool and dev server
- **Wouter** for client-side routing (lightweight alternative to React Router)
- **TanStack Query** for server state management
- **Zustand** with persistence for client-side state (current page, PDF file, settings)
- **Shadcn/ui** component library built on Radix UI primitives
- **Tailwind CSS v4** for styling
- **react-pdf** for PDF rendering with local worker bundling

### Backend Architecture
- **Express.js** server with TypeScript
- **Drizzle ORM** for database operations
- **PostgreSQL** database (connection via DATABASE_URL environment variable)
- **Multer** for file uploads (PDFs and audio files)
- Static file serving for uploaded content from `/uploads` directory

### Audio Processing
- **Meyda** library for real-time audio feature extraction (RMS, ZCR, spectral centroid, MFCC)
- Custom audio fingerprinting and matching algorithms
- Speech recognition integration for text-based page matching
- Viterbi algorithm implementation for probabilistic page state tracking

### Data Storage
- **Users**: Basic authentication (username/password)
- **Uploaded Files**: Track PDFs and audio recordings with metadata
- **Training Sessions**: Store training recordings with audio paths
- **Page Markers**: Audio fingerprints with timestamps for each page
- **Aggregated Fingerprints**: Averaged audio features across multiple training sessions
- **Page Transcripts**: Text content and keywords for each PDF page

### AI Integration
- **Google Gemini AI** via Replit AI Integrations for:
  - Text generation and chat functionality
  - Image generation capabilities
  - Batch processing with rate limit handling

### Key Design Patterns
- Shared schema between frontend and backend (`shared/schema.ts`)
- Path aliases for clean imports (`@/` for client, `@shared/` for shared code)
- Zustand store with localStorage persistence for cross-tab page synchronization
- Separate audio matcher implementations (feature-based, speech-based, DTW, Viterbi)

## External Dependencies

### Database
- PostgreSQL via `DATABASE_URL` environment variable
- Drizzle Kit for schema migrations (`npm run db:push`)

### AI Services
- Replit AI Integrations (Gemini API) via:
  - `AI_INTEGRATIONS_GEMINI_API_KEY`
  - `AI_INTEGRATIONS_GEMINI_BASE_URL`

### File Storage
- Local filesystem storage in `uploads/` directory for PDFs and audio
- Static file serving configured for both development and production

### Key npm Packages
- `drizzle-orm` / `drizzle-zod`: Database ORM and validation
- `react-pdf` / `pdfjs-dist`: PDF rendering
- `meyda`: Audio feature extraction
- `@google/genai`: Gemini AI client
- `multer`: File upload handling
- `connect-pg-simple`: PostgreSQL session storage