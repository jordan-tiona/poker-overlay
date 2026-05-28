import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  captureIgnition: () => ipcRenderer.invoke('capture-ignition') as Promise<{ dataUrl?: string; windowHeight?: number | null; error?: string; sources?: string[] }>,
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  onClickThroughChanged: (cb: (isClickThrough: boolean) => void) => {
    ipcRenderer.on('click-through-changed', (_event, val) => cb(val))
    return () => ipcRenderer.removeAllListeners('click-through-changed')
  },
})
