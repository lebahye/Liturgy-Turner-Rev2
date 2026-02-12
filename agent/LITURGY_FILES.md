# Liturgy Files

## Audio Recording
**File:** full_service.wav  
**Size:** 480MB  
**Date:** November 30, 2025 17:14:29  
**Content:** Full Armenian liturgy service recording

This is the reference audio for fingerprinting and page-turn automation.

## Liturgy Text/Music
**File:** liturgy.pdf  
**Size:** 1.8MB  
**Title:** Badarak original with hokehankist_RN3Parag_Final_Rev3  
**Content:** Complete liturgy text and music notation

This PDF contains the pages that need to be turned during the service.

## Usage
These files are used together:
1. Audio fingerprinting analyzes full_service.wav to identify key moments
2. Speech recognition detects specific liturgical phrases
3. Page turns in liturgy.pdf are triggered at the identified moments
4. The system learns the timing and pattern for future services

## Next Steps
- Extract audio fingerprints from the WAV file
- Parse the PDF to identify page boundaries
- Map audio timestamps to page numbers
- Test automatic page turning during playback
