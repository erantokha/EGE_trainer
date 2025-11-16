// tasks/shared/js/catalog.js
// Тонкий адаптер: реэкспорт всего из data/catalog.js,
// чтобы импорт можно было писать коротко:
//   import { loadCatalogIndex, makeSections, asset, baseHref } from '../../shared/js/catalog.js';

export * from './data/catalog.js';

// Опциональный default-экспорт для старых страниц:
import * as Catalog from './data/catalog.js';
export default Catalog;
