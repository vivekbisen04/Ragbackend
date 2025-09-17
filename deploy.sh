#!/bin/bash

echo "🚀 RAG Chatbot Backend Deployment Script"
echo "========================================"

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📂 Initializing Git repository..."
    git init
else
    echo "✅ Git repository already initialized"
fi

# Add all files
echo "📦 Adding files to Git..."
git add .

# Commit changes
echo "💾 Committing changes..."
git commit -m "Prepare backend for Railway deployment

- Add Dockerfile and .dockerignore
- Configure Qdrant Cloud support with API keys
- Add deployment configuration
- Update environment variables for production"

echo ""
echo "✅ Backend is ready for deployment!"
echo ""
echo "Next steps:"
echo "1. Create GitHub repository: https://github.com/new"
echo "2. Push code: git remote add origin <your-repo-url>"
echo "3. Push: git push -u origin main"
echo "4. Deploy to Railway: https://railway.app"
echo ""
echo "📋 Don't forget to:"
echo "- Set up Qdrant Cloud cluster"
echo "- Configure environment variables in Railway"
echo "- Add Redis addon in Railway"
echo ""
echo "📖 See DEPLOYMENT.md for detailed instructions"