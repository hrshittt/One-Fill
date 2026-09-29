import { getSettings } from '../storage/settings-storage';
import { applyTheme } from '../ui/theme';

void getSettings().then((s) => applyTheme(s.theme));
