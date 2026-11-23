import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import { Landing } from "./pages/Landing";
import { Create } from "./pages/Create";
import { Workshop } from "./pages/Workshop";
import { History, Debrief } from "./pages/History";
import { useSave } from "./store";
import { WalletRoot } from "./wallet/WalletContext";

const Shop = lazy(() => import("./pages/Shop").then((m) => ({ default: m.Shop })));
const Arena = lazy(() => import("./pages/Arena").then((m) => ({ default: m.Arena })));

function NeedsAgent({ children }: { children: React.ReactElement }) {
  const save = useSave();
  return save.agent ? children : <Navigate to="/create" replace />;
}

function Loading() {
  return <div className="grid min-h-screen place-items-center font-pixel text-xs text-cyan">LOADING THE GRID…</div>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <WalletRoot>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/create" element={<Create />} />
          <Route path="/arena" element={<NeedsAgent><Arena /></NeedsAgent>} />
          <Route path="/workshop" element={<NeedsAgent><Workshop /></NeedsAgent>} />
          <Route path="/history" element={<NeedsAgent><History /></NeedsAgent>} />
          <Route path="/history/:id" element={<NeedsAgent><Debrief /></NeedsAgent>} />
          <Route path="/shop" element={<Shop />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </WalletRoot>
    </BrowserRouter>
  </StrictMode>,
);
