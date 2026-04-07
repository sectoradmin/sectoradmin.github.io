import { Suspense } from "react"
import MainApp from "../components/main-app"

export default function SectorFMApp() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MainApp />
    </Suspense>
  );
}