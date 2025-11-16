// tasks/shared/js/data/catalog.js
// Шим для старых импортов. Пробрасываем новые функции под старыми именами.

export {
  asset,
  loadCatalogIndex as loadCatalog,
  makeSections,
  baseHref
} from '../catalog.js';
