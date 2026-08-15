import React from "react";
import { useQuery } from "@tanstack/react-query";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";
import { AdminPage } from "./ui/pages/admin-page";
import { fetchSession } from "./lib/api";
import { AppLayout } from "./ui/app-layout";
import { BrowsePage } from "./ui/pages/browse-page";
import { ChatPage } from "./ui/pages/chat-page";
import { ChallengesPage } from "./ui/pages/challenges-page";
import { ChallengeSessionPage } from "./ui/pages/challenge-session-page";
import { ConversationsPage } from "./ui/pages/conversations-page";
import { FavoritesPage } from "./ui/pages/favorites-page";
import { HomePage } from "./ui/pages/home-page";
import { LoginPage } from "./ui/pages/login-page";
import { LiveTriviaPage } from "./ui/pages/live-trivia-page";
import { MyProfilePage } from "./ui/pages/my-profile-page";
import { NotificationsPage } from "./ui/pages/notifications-page";
import { PaymentCancelPage } from "./ui/pages/payment-cancel-page";
import { PaymentSuccessPage } from "./ui/pages/payment-success-page";
import { SignupPage } from "./ui/pages/signup-page";
import { CreateProfilePage } from "./ui/pages/create-profile-page";
import { ChildSafetyPage } from "./ui/pages/child-safety-page";
import { PrivacyPage } from "./ui/pages/privacy-page";
import { SupportPage } from "./ui/pages/support-page";
import { TermsPage } from "./ui/pages/terms-page";
import { GuidelinesPage } from "./ui/pages/guidelines-page";
import { ForgotPasswordPage } from "./ui/pages/forgot-password-page";
import { ResetPasswordPage } from "./ui/pages/reset-password-page";
import { DeleteAccountPage } from "./ui/pages/delete-account-page";
import { ProfileDetailPage } from "./ui/pages/profile-detail-page";
import "./styles.css";

const queryClient = new QueryClient();

const founderEmail = "elderawi369@gmail.com";

function FounderConsoleRoute() {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    retry: false,
  });
  const isFounder =
    sessionQuery.data?.user?.email?.toLowerCase() === founderEmail;

  if (sessionQuery.isLoading) {
    return null;
  }

  return isFounder ? <AdminPage /> : <Navigate to="/" replace />;
}

function BrowseRouteGuard({
  children,
}: {
  children: React.ReactElement;
}) {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    retry: false,
  });

  if (sessionQuery.isLoading) {
    return null;
  }

  if (sessionQuery.data?.authenticated && !sessionQuery.data?.hasProfile) {
    return (
      <Navigate
        to="/create-profile"
        replace
        state={{ browseBlocked: true }}
      />
    );
  }

  return children;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "admin",
        element: <Navigate to="/" replace />,
      },
      {
        path: "founder-console",
        element: <FounderConsoleRoute />,
      },
      {
        path: "signup",
        element: <SignupPage />,
      },
      {
        path: "login",
        element: <LoginPage />,
      },
      {
        path: "forgot-password",
        element: <ForgotPasswordPage />,
      },
      {
        path: "reset-password",
        element: <ResetPasswordPage />,
      },
      {
        path: "create-profile",
        element: <CreateProfilePage />,
      },
      {
        path: "my-profile",
        element: <MyProfilePage />,
      },
      {
        path: "browse",
        element: (
          <BrowseRouteGuard>
            <BrowsePage />
          </BrowseRouteGuard>
        ),
      },
      {
        path: "browse/:username",
        element: (
          <BrowseRouteGuard>
            <ProfileDetailPage />
          </BrowseRouteGuard>
        ),
      },
      {
        path: "conversations",
        element: <ConversationsPage />,
      },
      {
        path: "challenges",
        element: <ChallengesPage />,
      },
      {
        path: "challenges/live",
        element: <LiveTriviaPage />,
      },
      {
        path: "challenges/:challengeId",
        element: <ChallengeSessionPage />,
      },
      {
        path: "favorites",
        element: <FavoritesPage />,
      },
      {
        path: "activity",
        element: <NotificationsPage />,
      },
      {
        path: "support",
        element: <SupportPage />,
      },
      {
        path: "delete-account",
        element: <DeleteAccountPage />,
      },
      {
        path: "privacy",
        element: <PrivacyPage />,
      },
      {
        path: "child-safety",
        element: <ChildSafetyPage />,
      },
      {
        path: "terms",
        element: <TermsPage />,
      },
      {
        path: "guidelines",
        element: <GuidelinesPage />,
      },
      {
        path: "payments/success",
        element: <PaymentSuccessPage />,
      },
      {
        path: "payments/cancel",
        element: <PaymentCancelPage />,
      },
      {
        path: "chat/:conversationId",
        element: <ChatPage />,
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
