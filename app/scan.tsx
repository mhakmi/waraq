import { copy } from '../src/copy';
import { Placeholder } from '../src/ui/Placeholder';
import { BackBar } from '../src/ui/TopBar';

export default function ScanScreen() {
  return <Placeholder title={copy.shell.scan} top={<BackBar />} />;
}
