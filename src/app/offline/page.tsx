import { WifiOffIcon } from "@/components/icons";

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
        backgroundColor: "var(--wedding-bg)",
        backgroundImage: "radial-gradient(ellipse at 50% 20%, rgba(195, 153, 107, 0.1) 0%, transparent 70%)",
        color: "#E2DDD5",
        textAlign: "center",
      }}
    >
      <div
        className="keepsake-paper-texture"
        style={{
          width: "100%",
          maxWidth: "380px",
          borderRadius: "18px",
          padding: "36px 24px",
          color: "var(--wedding-text-primary)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(195, 153, 107, 0.3)",
        }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            border: "1px solid var(--wedding-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            color: "var(--wedding-accent)",
          }}
        >
          <WifiOffIcon size={22} />
        </div>

        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "28px",
            fontWeight: 600,
            margin: "0 0 12px",
            lineHeight: 1.25,
          }}
        >
          You’re offline
        </h1>

        <p
          style={{
            fontSize: "14px",
            color: "var(--wedding-text-muted)",
            lineHeight: 1.5,
            marginBottom: "16px",
          }}
        >
          The wedding camera needs to be opened once while connected before it can work offline.
        </p>

        <p
          style={{
            fontSize: "13px",
            color: "var(--wedding-text-muted)",
            lineHeight: 1.5,
          }}
        >
          Reconnect to the internet, then reopen the camera from the wedding QR code.
        </p>
      </div>
    </main>
  );
}
