import CsvBacktest from "./CsvBacktest";
import { ThemeProvider } from "./components/ui/theme-provider";

function App() {

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <CsvBacktest />
    </ThemeProvider>);
}

export default App
