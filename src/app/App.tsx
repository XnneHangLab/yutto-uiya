import { Providers } from './providers';
import { AppShell } from '../layouts/AppShell/AppShell';
import '../styles/shell.css';

function App() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}

export default App;
