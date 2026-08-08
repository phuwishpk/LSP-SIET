import { useEffect } from 'react';
import { defaultTheme } from '@/infrastructure/next-ui';
import { NextUIProvider } from '@nextui-org/react';
import { ToastContainer } from 'react-toastify';
import FontLoader from "@/infrastructure/font-loader";
import 'react-toastify/dist/ReactToastify.css';
import globalStyles from "@/shared/styles/global-style";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en.json";

TimeAgo.addLocale(en);

const WORKSPACE_TOKEN_KEY = 'kmitlai-workspace-token';

function WorkspaceTokenBridge() {
  // Stash the JWT from ?token=… into localStorage so the rest of the app
  // (including the PocketBase wrapper) can send it back to the workspace API
  // when it needs to. The query parameter is removed from the URL bar
  // immediately so we never leak it via referer.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    if (token) {
      window.localStorage.setItem(WORKSPACE_TOKEN_KEY, token);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);
  return null;
}

function MyApp({ Component, pageProps }) {
  globalStyles();
  return (
    <>
      <WorkspaceTokenBridge />
      <FontLoader />
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
      <NextUIProvider theme={defaultTheme}>
        <Component {...pageProps} />
      </NextUIProvider>
    </>
  );
}

export default MyApp;