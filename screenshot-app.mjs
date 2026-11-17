import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

// Aguardar Electron abrir
await new Promise(resolve => setTimeout(resolve, 8000));

// Usar screenshot da tela
import { execSync } from 'child_process';
try {
  execSync('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $screen = [System.Windows.Forms.Screen]::PrimaryScreen; $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size); $bitmap.Save(\'C:\temp\screenshot.png\', [System.Drawing.Imaging.ImageFormat]::Png); $graphics.Dispose(); $bitmap.Dispose();"', { stdio: 'inherit' });
  console.log('✅ Screenshot capturado');
} catch (e) {
  console.error('Erro ao capturar:', e.message);
}
