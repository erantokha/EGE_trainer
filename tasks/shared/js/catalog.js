// tasks/shared/js/catalog.js
// Шим-обёртка: реэкспорт всего из data/catalog.js,
// чтобы можно было импортировать как
//   import { loadCatalogIndex, makeSections, asset, baseHref } from './shared/js/catalog.js';
// и при этом сохранить совместимость.

export * from './data/catalog.js';

// На случай default-импорта в старых страницах:
import * as Catalog from './data/catalog.js';
export default Catalog;
