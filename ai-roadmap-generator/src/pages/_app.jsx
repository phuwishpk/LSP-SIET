import Head from 'next/head'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import '@/styles/app.css'
import { Navbar } from '@shared/components/Navbar'
import { communityUrl } from '@/lib/workspace'
import { useWorkspace, WorkspaceProvider } from '@/lib/workspace-context'

function Shell({ Component, pageProps }) {
  const { status } = useWorkspace()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)] antialiased font-sans">
      <div className="relative z-[100] shrink-0" style={{ height: '64px', minHeight: '64px' }}>
        <Navbar />
      </div>
      <div className="relative z-0 flex-1 min-h-0 overflow-y-auto">
        {status === 'loading' ? (
          <main className="center-screen">
            <p className="muted">กำลังเข้าสู่ระบบ…</p>
          </main>
        ) : status === 'blocked' ? (
          <main className="center-screen">
            <h1 className="h2">เข้าสู่ระบบไม่สำเร็จ</h1>
            <p className="muted">เซสชันหมดอายุ หรือเชื่อมต่อ SIET Space ไม่ได้ กรุณาเข้าสู่ระบบใหม่แล้วกลับมาที่ AI Roadmap อีกครั้ง</p>
            <a className="btn btn-primary" href={communityUrl()}>
              ไปที่ SIET Space
            </a>
          </main>
        ) : (
          <Component {...pageProps} />
        )}
      </div>
    </div>
  )
}

export default function MyApp(props) {
  return (
    <>
      <Head>
        <title>AI Roadmap · SIET Space</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <WorkspaceProvider>
        <Shell {...props} />
      </WorkspaceProvider>
      <ToastContainer position="bottom-center" autoClose={4000} theme="dark" hideProgressBar closeOnClick />
    </>
  )
}
