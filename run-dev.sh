#!/bin/bash

# EduHub Project - Local Development Server
# This script starts an HTTP server to view the demo and React project

echo "🚀 Starting EduHub Development Environment..."
echo ""

# Check if we're in the right directory
if [ ! -f "DEMO.html" ]; then
    echo "❌ Error: Please run this script from the app hda directory"
    exit 1
fi

echo "📱 DEMO FILE CREATED: DEMO.html"
echo "   View the interactive demo at:"
echo "   → file://$(pwd)/DEMO.html"
echo ""
echo "💻 To view in browser, open:"
echo "   • Firefox/Chrome: file://${PWD}/DEMO.html"
echo "   • OR run Python server:"
echo "     python3 -m http.server 8000"
echo "     then visit http://localhost:8000/DEMO.html"
echo ""

# Check npm status
if command -v npm &> /dev/null; then
    echo "✅ Node.js v$(node --version) detected"
    echo "✅ npm v$(npm --version) detected"
    echo ""
    echo "📦 Web Dashboard Setup:"
    echo "   cd web"
    echo "   npm install"
    echo "   npm start"
    echo ""
fi

# Check Flutter status
if command -v flutter &> /dev/null; then
    echo "✅ Flutter $(flutter --version | head -1) detected"
    echo ""
    echo "📱 Mobile App Setup:"
    echo "   cd mobile"
    echo "   flutter pub get"
    echo "   flutter run -d android  # or -d ios"
    echo ""
else
    echo "❌ Flutter not installed"
    echo "   📝 To install Flutter:"
    echo "   1. Download from https://flutter.dev/docs/get-started/install"
    echo "   2. Add Flutter to your PATH"
    echo "   3. Run: flutter doctor"
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📖 Documentation:"
echo "   • README.md - Quick start guide"
echo "   • DESIGN_SYSTEM.md - Design tokens"
echo "   • SETUP_AND_DEVELOPMENT_GUIDE.md - Detailed setup"
echo "   • ARCHITECTURE_AND_INTEGRATION.md - System design"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
