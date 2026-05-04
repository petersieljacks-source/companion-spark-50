import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#211f1d" },
      { title: "BØFSHOWET" },
      { name: "description", content: "A minimal Wendler 5/3/1 strength tracker — programs, sessions, AMRAPs, and 1RM trends." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "BØFSHOWET" },
      { property: "og:description", content: "A minimal Wendler 5/3/1 strength tracker — programs, sessions, AMRAPs, and 1RM trends." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "BØFSHOWET" },
      { name: "twitter:description", content: "A minimal Wendler 5/3/1 strength tracker — programs, sessions, AMRAPs, and 1RM trends." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/eaca4e99-b421-472d-aee8-44e167b679ee/id-preview-b5ec0b11--17e6dcad-79cb-4c9a-8996-9a6fa4106e41.lovable.app-1777882474943.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/eaca4e99-b421-472d-aee8-44e167b679ee/id-preview-b5ec0b11--17e6dcad-79cb-4c9a-8996-9a6fa4106e41.lovable.app-1777882474943.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster theme="dark" position="top-center" />
    </AuthProvider>
  );
}
