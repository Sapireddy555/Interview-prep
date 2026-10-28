# Azure App Service (Web App) Deployment Guide

This guide describes how to deploy the **ProPrep AI** Next.js application to **Azure App Service (Azure Web App)**.

---

## 1. Choose App Service Operating System

We **strongly recommend** using the **Linux Node.js 20 LTS** runtime. Linux-based App Service runs Node applications natively, matches our optimized package scripts, and has superior performance compared to Windows.

*   **Operating System**: Linux
*   **Runtime Stack**: Node 20 LTS (or Node 22)
*   **Pricing Plan**: Basic (B1) or higher (Standard/Premium recommended for production traffic and webcam video upload processing).

*Note: If you are forced to use a Windows-based App Service, we have provided [web.config](file:///c:/Surya/Interview-prep-1/web.config) and [server.js](file:///c:/Surya/Interview-prep-1/server.js) in the root directory to automatically handle IIS Node routing.*

---

## 2. Configure Environment Variables (Application Settings)

Once your App Service is created, configure the following environment variables. In the Azure Portal, navigate to your App Service, go to **Settings** -> **Configuration** (or **Environment Variables**), and add these keys under **Application Settings**:

| Key | Value Source | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://azureuser:Valuemomentum123@agent-marketplace.postgres.database.azure.com:5432/interview-bot?sslmode=require` | Azure Database for PostgreSQL connection string. |
| `CRYPTO_MASTER_KEY` | *(A secure 32-byte hex string e.g. from `openssl rand -hex 32`)* | Master key used for AES-256-GCM column encryption. |
| `DB_SSL_CA` | *(Optional path or text certificate contents)* | Strict TLS CA certificate for DB connection. |
| `AZURE_STORAGE_CONNECTION_STRING` | *(Your Azure Storage connection string)* | Upload target container for video recordings and screenshots. |
| `AZURE_STORAGE_SAS_URL` | *(SAS token URL, if preferred)* | Alternative upload target authorization. |
| `AZURE_VISION_ENDPOINT` | `https://interview-prep-ai.cognitiveservices.azure.com/` | Cognitive Vision Endpoint for webcam face checking. |
| `AZURE_VISION_KEY` | `CAWb9ZfF5GAqnymFKBJzqa...` | Cognitive Vision authorization key. |
| `AI_PRIMARY_PROVIDER` | `azure` (or `gemini`) | Sets LLM client engine. |
| `GEMINI_API_KEY` | *(Your Gemini API key)* | Used if `AI_PRIMARY_PROVIDER` is set to `gemini`. |
| `AZURE_OPENAI_ENDPOINT` | *(Your Azure OpenAI endpoint)* | Used if primary provider is set to `azure`. |
| `AZURE_OPENAI_KEY` | *(Your Azure OpenAI API key)* | Used if primary provider is set to `azure`. |
| `NEXT_PUBLIC_APP_URL` | *(Your public Web App URL e.g. `https://<app-name>.azurewebsites.net`)* | Set to generate invitation email links. |

---

## 3. How to Deploy the Code

The application must be built before it starts in Azure. The production server defaults to production mode, so deploy the generated `.next` directory with the app, or enable build automation for source deployments (`SCM_DO_BUILD_DURING_DEPLOYMENT=true`). Confirm the deployment logs show `npm run build` completed successfully before `npm start` runs. A missing build can cause startup errors mentioning `.next/trace`. When packaging a GitHub Actions artifact, explicitly include `.next/**`; it is a hidden directory and may be omitted by artifact upload defaults. Keep the artifact file list explicit when enabling hidden files so local `.env` files are not deployed.

No custom startup command is required when the App Service detects the Node.js app: `npm start` runs `node server.js`. Set the App Service application setting `NODE_ENV` to `production` for clarity. Set it to `development` only for local development.

### Option A: Deployment via VS Code (Recommended for testing)
1. Install the **Azure Resources** and **Azure App Service** extensions in VS Code.
2. Log in to your Azure Account.
3. Open the repository workspace in VS Code.
4. Run a local build to verify no errors:
   ```bash
   npm run build
   ```
5. Right-click the project root folder -> **Deploy to Web App...** -> select your App Service.

---

### Option B: Deployment via GitHub Actions (Continuous Deployment)
Create a `.github/workflows/azure-deploy.yml` file:
```yaml
name: Deploy to Azure Web App

on:
  push:
    branches:
      - main

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Build Next.js Web App
        run: npm run build
        env:
          # Include build-time public variables if required by Next.js
          NEXT_PUBLIC_APP_URL: ${{ secrets.NEXT_PUBLIC_APP_URL }}

      - name: Deploy to Azure Web App
        uses: azure/webapps-deploy@v3
        with:
          app-name: '<your-app-name-here>'
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: .
```

---

## 4. How Migrations are Executed
We have updated the production `"start"` script in `package.json` to:
```json
"start": "npm run migrate:up && next start"
```
When Azure App Service spins up the Docker container for Node.js, it will automatically execute `npm run migrate:up` to apply any new database schema modifications before launching the Next.js server. This keeps database schemas and backend code perfectly synced without manual intervention.
