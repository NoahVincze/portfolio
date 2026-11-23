/**
 * Every page effect. Importing this module registers them with src/motion/page.ts.
 * Order matters: horizontal.ts must run before the reveals that read its tracks.
 */
import './horizontal';
import './reveal-lines';
import './reveal-images';
import './progress';
import './magnetic';
import './filter';
import './work-map';
import './timeline';
import './contact';
import './physics-chips';
import './marquee';
