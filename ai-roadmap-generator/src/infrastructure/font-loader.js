// Inter is the preferred family, but during Docker builds the @next/font
// download from Google Fonts is blocked. We fall back to a system font
// stack that visually matches Inter closely enough for the build to
// succeed offline. The `--inter-font` CSS variable is still emitted so
// `global.css` keeps working unchanged.
const FONT_STACK =
  'Inter, "Inter Variable", -apple-system, BlinkMacSystemFont, ' +
  '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const FontLoader = () => {
  return (
    <style jsx global>{`
      :root {
        --inter-font: ${FONT_STACK};
      }
    `}</style>
  );
};

export default FontLoader;
