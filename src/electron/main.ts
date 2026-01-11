import { app, BrowserWindow, shell } from 'electron';
import { startDashboard } from '../dashboard/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fix for __dirname in ESM
const __dirname = fileURLToPath(new URL(".", import.meta.url));

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  // Start the server (without opening browser)
  const serverUrl = await startDashboard(undefined, { skipOpen: true });
  
  if (!serverUrl) {
    console.error("Failed to start server");
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false, // Security best practice
      contextIsolation: true,
    },
    title: "ADDEG Dev Diary",
    autoHideMenuBar: true
  });

  // Load the Fastify server URL
  await mainWindow.loadURL(serverUrl);

  // Handle external links (open in default browser, not in Electron)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
