import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AdminPage } from "./ui/pages/admin-page";
import { AppLayout } from "./ui/app-layout";
import { BrowsePage } from "./ui/pages/browse-page";
import { ChatPage } from "./ui/pages/chat-page";
import { ConversationsPage } from "./ui/pages/conversations-page";
import { FavoritesPage } from "./ui/pages/favorites-page";
import { HomePage } from "./ui/pages/home-page";
import { LoginPage } from "./ui/pages/login-page";
import { SignupPage } from "./ui/pages/signup-page";
import { CreateProfilePage } from "./ui/pages/create-profile-page";
import "./styles.css";

const queryClient = new QueryClient();

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
        element: <AdminPage />,
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
        path: "create-profile",
        element: <CreateProfilePage />,
      },
      {
        path: "browse",
        element: <BrowsePage />,
      },
      {
        path: "conversations",
        element: <ConversationsPage />,
      },
      {
        path: "favorites",
        element: <FavoritesPage />,
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
