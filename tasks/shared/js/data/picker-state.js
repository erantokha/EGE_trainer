
export const CHOICE_TOPICS = {};   // topicId -> count
export const CHOICE_SECTIONS = {}; // sectionId -> count

export function setTopicCount(topicId, n){
  CHOICE_TOPICS[topicId] = n;
}
export function setSectionCount(sectionId, n){
  CHOICE_SECTIONS[sectionId] = n;
}
export function totalSelected(){
  const t1 = Object.values(CHOICE_TOPICS).reduce((s,n)=>s+(n||0),0);
  const t2 = Object.values(CHOICE_SECTIONS).reduce((s,n)=>s+(n||0),0);
  return t1>0 ? t1 : t2;
}
