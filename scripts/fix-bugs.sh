#!/bin/bash

echo "🔧 FIXING CRITICAL BUGS..."
echo "=========================="
echo ""

cd /app/project

# Step 1: Stop everything
echo "1. Stopping services..."
docker compose down

# Step 2: Clear bad state
echo "2. Clearing bad PDF state..."
rm -f data/liturgy-turner.db-wal data/liturgy-turner.db-shm

# Step 3: Rebuild
echo "3. Rebuilding app..."
npm run build

# Step 4: Start services
echo "4. Starting services..."
docker compose up -d

echo ""
echo "✅ Fixes applied!"
echo ""
echo "Testing in 10 seconds..."
sleep 10

# Step 5: Set valid PDF
echo "5. Setting valid PDF..."
curl -X POST http://localhost:5000/api/control/pdf/set \
  -H "Content-Type: application/json" \
  -d '{
    "pdfPath": "/uploads/pdfs/7ad0d220e9292f359b6cb0949e923a03.pdf",
    "pdfId": "7ad0d220e9292f359b6cb0949e923a03",
    "totalPages": 183
  }' \
  -s | head -100

echo ""
echo ""
echo "🧪 Testing endpoints..."
echo "Dashboard: http://localhost:5000"
echo "Chat: http://localhost:5000/chat"
echo "Live Mode: http://localhost:5000/live"
echo ""
echo "Please refresh your browser and test!"
