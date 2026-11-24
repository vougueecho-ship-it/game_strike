import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apkMime = {
  name: 'apk-mime',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = req.url?.split('?')[0] || ''
      if (path.endsWith('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive')
        res.setHeader('Content-Disposition', 'attachment')
      }
      next()
    })
  },
}

export default defineConfig({
  plugins: [apkMime, react()],
})

