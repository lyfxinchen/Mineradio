import { spawn, ChildProcess } from 'child_process'

let mousePollerProcess: ChildProcess | null = null
let pollerBuffer = ''

export function startMousePoller(onMiddleClick: () => void): void {
  if (process.platform !== 'win32' || mousePollerProcess) return

  const script = `
$ErrorActionPreference = "SilentlyContinue"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MineradioMousePoll {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
}
"@
$prev = $false
while ($true) {
  $down = (([MineradioMousePoll]::GetAsyncKeyState(4) -band 0x8000) -ne 0)
  if ($down -and -not $prev) {
    [Console]::Out.WriteLine("MMB")
    [Console]::Out.Flush()
  }
  $prev = $down
  Start-Sleep -Milliseconds 24
}
`

  try {
    mousePollerProcess = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    mousePollerProcess.stdout?.on('data', (chunk) => {
      pollerBuffer += chunk.toString('utf8')
      const lines = pollerBuffer.split(/\r?\n/)
      pollerBuffer = lines.pop() || ''
      lines.forEach((line) => {
        if (line.trim() === 'MMB') {
          onMiddleClick()
        }
      })
    })

    mousePollerProcess.on('exit', () => {
      mousePollerProcess = null
      pollerBuffer = ''
    })

    mousePollerProcess.on('error', (err) => {
      console.error('[MousePoller] process error:', err)
      mousePollerProcess = null
      pollerBuffer = ''
    })
  } catch (e) {
    console.error('[MousePoller] spawn failed:', e)
    mousePollerProcess = null
    pollerBuffer = ''
  }
}

export function stopMousePoller(): void {
  if (!mousePollerProcess) return
  try {
    mousePollerProcess.kill()
  } catch (e) {
    console.error('[MousePoller] kill failed:', e)
  }
  mousePollerProcess = null
  pollerBuffer = ''
}
