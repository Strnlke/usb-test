'use strict';
/* Character Archive — USB folder storage. No accounts, tokens, or remote APIs. */
const $ = id => document.getElementById(id);
const el = (tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const cleanName = value => String(value || '').trim();
const folderSafe = value => {
  const name = cleanName(value).replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 70) || 'Untitled';
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name) ? '_' + name : name;
};
const randomId = () => crypto.randomUUID();
const dateNow = () => new Date().toISOString();
const status = (message, kind = '') => { $('saveStatus').textContent = message; $('saveStatus').dataset.kind = kind; };
let toastTimer;
function toast(message, isError = false) {
  const t = $('toast');
  clearTimeout(toastTimer);
  t.textContent = message;
  t.classList.toggle('error', isError);
  t.classList.remove('hidden');
  toastTimer = setTimeout(() => t.classList.add('hidden'), 6000);
}
const state = {
  root: null, manifest: null, writer: null, writerDir: null,
  novels: [], novel: null, novelDir: null, charsDir: null, portraitsDir: null,
  characters: [], active: null, saveTimer: null, saving: null,
  revision: 0, savedRevision: 0, portraitUrl: null, epoch: 0
};

async function readJSON(handle) {
  const file = await handle.getFile();
  return JSON.parse(await file.text());
}
async function putFile(directory, filename, content) {
  const handle = await directory.getFileHandle(filename, { create: true });
  await writeHandle(handle, content);
  return handle;
}
async function writeHandle(handle, content) {
  const writer = await handle.createWritable();
  try { await writer.write(content); await writer.close(); }
  catch (error) { try { await writer.abort(); } catch {} throw error; }
}
async function putJSON(directory, filename, data) {
  return putFile(directory, filename, JSON.stringify(data, null, 2) + '\n');
}
function diskProfile(character) {
  return JSON.parse(JSON.stringify(character, (key, value) => key.startsWith('_') ? undefined : value));
}
function hasUnsaved() { return state.revision > state.savedRevision; }
function queueSave() {
  if (!state.active) return;
  state.revision++;
  status('Unsaved changes', 'busy');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => { void flush(); }, 700);
}
async function flush() {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (state.saving) return state.saving;
  if (!state.active || !hasUnsaved()) return true;
  const character = state.active;
  const epoch = state.epoch;
  state.saving = (async () => {
    while (state.revision > state.savedRevision) {
      const revision = state.revision;
      const now = dateNow();
      const snapshot = diskProfile({ ...character, updatedAt: now });
      try {
        status('Saving to USB…', 'busy');
        await writeHandle(character._handle, JSON.stringify(snapshot, null, 2) + '\n');
        state.savedRevision = revision;
        character.updatedAt = now;
        if (state.active === character && epoch === state.epoch) {
          $('lastSavedLabel').textContent = 'Saved ' + new Date(now).toLocaleString();
        }
      } catch (error) {
        status('Save failed — changes not saved', 'bad');
        $('retrySaveBtn').classList.remove('hidden');
        $('downloadUnsavedBtn').classList.remove('hidden');
        toast('Could not write to the selected folder: ' + error.message + '. Keep this tab open and reconnect the USB if needed.', true);
        return false;
      }
    }
    status('Saved to folder');
    $('retrySaveBtn').classList.add('hidden');
    $('downloadUnsavedBtn').classList.add('hidden');
    return true;
  })();
  try { return await state.saving; }
  finally { state.saving = null; }
}
function setStage(stage) {
  $('startup').classList.toggle('hidden', stage === 'workspace');
  $('folderStep').classList.toggle('hidden', stage !== 'folder');
  $('writerStep').classList.toggle('hidden', stage !== 'writer');
  $('workspace').classList.toggle('hidden', stage !== 'workspace');
  $('backupBtn').classList.toggle('hidden', !state.root);
  $('changeFolderBtn').classList.toggle('hidden', !state.root);
}
function clearNovelState() {
  state.novel = null; state.novelDir = null; state.charsDir = null; state.portraitsDir = null;
  state.characters = []; state.active = null; state.revision = 0; state.savedRevision = 0;
  state.epoch++;
  cleanPortraitUrl();
}
function clearRootState() {
  state.root = null; state.manifest = null; state.writer = null; state.writerDir = null;
  state.novels = []; clearNovelState();
}
async function askName(title, label, hint = '') {
  const dialog = $('nameDialog');
  $('nameDialogTitle').textContent = title;
  $('nameDialogLabel').textContent = label;
  $('nameDialogHint').textContent = hint;
  $('nameInput').value = '';
  return new Promise(resolve => {
    const form = $('nameForm');
    const onSubmit = event => {
      event.preventDefault();
      const value = cleanName($('nameInput').value);
      if (!value) return;
      dialog.close('ok');
    };
    const onCancel = () => dialog.close('cancel');
    const onClose = () => {
      form.removeEventListener('submit', onSubmit);
      $('cancelNameBtn').removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'ok' ? cleanName($('nameInput').value) : null);
    };
    form.addEventListener('submit', onSubmit);
    $('cancelNameBtn').addEventListener('click', onCancel);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    $('nameInput').focus();
  });
}
async function selectFolder() {
  $('folderError').classList.add('hidden');
  if (!window.isSecureContext || typeof window.showDirectoryPicker !== 'function') {
    $('folderError').textContent = 'Folder access is unavailable. Open this application in current Chrome or Edge using its HTTPS GitHub Pages address (or localhost).';
    $('folderError').classList.remove('hidden');
    return;
  }
  if (hasUnsaved() || state.saving) {
    toast('Finish saving before changing folders. Click Select folder again after it says Saved.', true);
    void flush();
    return;
  }
  try {
    const root = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (typeof root.queryPermission === 'function' && await root.queryPermission({ mode: 'readwrite' }) !== 'granted') {
      if (await root.requestPermission({ mode: 'readwrite' }) !== 'granted') {
        toast('Folder write permission was not granted.', true); return;
      }
    }
    let manifest;
    try {
      const fh = await root.getFileHandle('character-archive-manifest.json');
      manifest = await readJSON(fh);
      if (manifest.type !== 'character-archive' || !Array.isArray(manifest.writers)) {
        throw new Error('The selected folder has a manifest that Character Archive cannot read. No changes were made.');
      }
    } catch (error) {
      if (error.name !== 'NotFoundError') throw error;
      if (!confirm('No Character Archive library was found in this folder. Create a new library here?')) return;
      manifest = { type: 'character-archive', version: 1, createdAt: dateNow(), writers: [] };
      await putJSON(root, 'character-archive-manifest.json', manifest);
    }
    clearRootState();
    state.root = root;
    state.manifest = manifest;
    $('folderName').textContent = root.name;
    $('retrySaveBtn').classList.add('hidden');
    $('downloadUnsavedBtn').classList.add('hidden');
    status('Library folder selected');
    renderWriterCards();
    setStage('writer');
  } catch (error) {
    if (error.name === 'AbortError') return;
    $('folderError').textContent = 'Cannot open folder: ' + error.message;
    $('folderError').classList.remove('hidden');
    toast('Folder access failed: ' + error.message, true);
  }
}
function renderWriterCards() {
  const host = $('writerGrid'); host.replaceChildren();
  for (const writer of state.manifest?.writers || []) {
    const button = el('button', 'writerCard'); button.type = 'button';
    button.append(el('span', 'writerAvatar', writer.name.slice(0,1).toUpperCase()), el('span', '', writer.name));
    button.addEventListener('click', () => void chooseWriter(writer.id));
    host.append(button);
  }
}
async function createWriter() {
  const name = await askName('Create writer profile', 'Writer name', 'For example, Aaron or Lindsay.');
  if (!name) return;
  if (state.manifest.writers.some(w => w.name.toLowerCase() === name.toLowerCase())) {
    toast('That writer already exists.', true); return;
  }
  const folders = state.manifest.writers.map(w => w.folder.toLowerCase());
  let folder = folderSafe(name), index = 2;
  while (folders.includes(folder.toLowerCase())) folder = folderSafe(name) + '-' + index++;
  const writer = { id: randomId(), name, folder };
  try {
    await state.root.getDirectoryHandle(folder, { create: true });
    const manifest = { ...state.manifest, writers: [...state.manifest.writers, writer] };
    await putJSON(state.root, 'character-archive-manifest.json', manifest);
    state.manifest = manifest;
    renderWriterCards();
    await chooseWriter(writer.id);
  } catch (error) { toast('Could not create writer: ' + error.message, true); }
}
async function chooseWriter(id) {
  if (!(await flush())) { toast('Save your changes before switching writers.', true); return; }
  const writer = state.manifest.writers.find(w => w.id === id);
  if (!writer) return;
  try {
    const directory = await state.root.getDirectoryHandle(writer.folder);
    const novels = [];
    for await (const [folderName, handle] of directory.entries()) {
      if (handle.kind !== 'directory') continue;
      try {
        const novel = await readJSON(await handle.getFileHandle('novel.json'));
        if (novel.type === 'character-archive-novel') novels.push({ ...novel, folder: folderName });
      } catch (error) { if (error.name !== 'NotFoundError') throw error; }
    }
    state.writer = writer; state.writerDir = directory; state.novels = novels.sort((a,b) => a.name.localeCompare(b.name));
    clearNovelState();
    $('currentWriter').textContent = writer.name;
    $('writerInitial').textContent = writer.name.slice(0,1).toUpperCase();
    renderNovelSelect();
    setStage('workspace');
    status('Library ready');
    if (state.novels.length) await chooseNovel(state.novels[0].id);
    else renderEmpty();
  } catch (error) { toast('Could not open writer: ' + error.message, true); }
}
function renderNovelSelect() {
  const select = $('novelSelect'); select.replaceChildren();
  if (!state.novels.length) select.add(new Option('No novels yet', ''));
  for (const novel of state.novels) select.add(new Option(novel.name, novel.id));
  if (state.novel) select.value = state.novel.id;
}
async function createNovel() {
  const name = await askName('Create a novel', 'Novel title');
  if (!name) return;
  if (state.novels.some(n => n.name.toLowerCase() === name.toLowerCase())) {
    toast('That novel already exists for this writer.', true); return;
  }
  const folders = state.novels.map(n => n.folder.toLowerCase());
  let folder = folderSafe(name), index = 2;
  while (folders.includes(folder.toLowerCase())) folder = folderSafe(name) + '-' + index++;
  try {
    const directory = await state.writerDir.getDirectoryHandle(folder, { create: true });
    await directory.getDirectoryHandle('characters', { create: true });
    await directory.getDirectoryHandle('portraits', { create: true });
    const novel = { type: 'character-archive-novel', id: randomId(), name, folder, createdAt: dateNow() };
    await putJSON(directory, 'novel.json', novel);
    state.novels.push(novel); state.novels.sort((a,b) => a.name.localeCompare(b.name));
    await chooseNovel(novel.id);
    toast('Novel created.');
  } catch (error) { toast('Could not create novel: ' + error.message, true); }
}
async function chooseNovel(id) {
  if (!(await flush())) { toast('Save your changes before switching novels.', true); renderNovelSelect(); return; }
  const novel = state.novels.find(n => n.id === id);
  if (!novel) return;
  try {
    const directory = await state.writerDir.getDirectoryHandle(novel.folder);
    const charsDir = await directory.getDirectoryHandle('characters', { create: true });
    const portraitsDir = await directory.getDirectoryHandle('portraits', { create: true });
    const characters = [];
    for await (const [filename, handle] of charsDir.entries()) {
      if (handle.kind !== 'file' || !filename.toLowerCase().endsWith('.json')) continue;
      const profile = await readJSON(handle);
      if (typeof profile.id !== 'string' || !profile.id || typeof profile.name !== 'string') {
        throw new Error('Invalid character profile: ' + filename);
      }
      profile._handle = handle;
      profile._filename = filename;
      characters.push(profile);
    }
    clearNovelState();
    state.novel = novel; state.novelDir = directory; state.charsDir = charsDir; state.portraitsDir = portraitsDir;
    state.characters = characters.sort((a,b) => a.name.localeCompare(b.name));
    renderNovelSelect(); renderCharacterList();
    if (characters.length) await chooseCharacter(characters[0].id);
    else renderEmpty();
    status('Library ready');
  } catch (error) { toast('Could not open novel: ' + error.message, true); renderNovelSelect(); }
}
function blankCharacter(name) {
  const now = dateNow();
  return {
    schema: 1, id: randomId(), name, createdAt: now, updatedAt: now, portraitFile: null,
    basic: { fullName: name, age: '', occupation: '', appearance: '', notes: '' },
    personality: { traits: '', fears: '', beliefs: '', motivations: '', notes: '' },
    background: { history: '', experiences: '', notes: '' },
    relationships: { links: [], notes: '' },
    story: { role: '', timeline: '', events: '', notes: '' },
    freeform: { notes: '' }
  };
}
async function createCharacter() {
  if (!state.novel) return;
  if (!(await flush())) return;
  const name = await askName('Create character', 'Character name', 'All six sections start blank except the character name.');
  if (!name) return;
  const character = blankCharacter(name);
  const fileName = folderSafe(name) + '--' + character.id.slice(0,8) + '.json';
  try {
    const handle = await putJSON(state.charsDir, fileName, character);
    character._handle = handle; character._filename = fileName;
    state.characters.push(character);
    state.characters.sort((a,b) => a.name.localeCompare(b.name));
    await chooseCharacter(character.id);
    toast('Character created and saved to the selected folder.');
  } catch (error) { toast('Could not create character: ' + error.message, true); }
}
function renderCharacterList() {
  const host = $('characterList'); host.replaceChildren();
  const search = $('searchInput').value.trim().toLowerCase();
  const chars = state.characters.filter(c => c.name.toLowerCase().includes(search));
  $('characterCount').textContent = String(state.characters.length);
  for (const character of chars) {
    const button = el('button', 'characterItem' + (state.active?.id === character.id ? ' active' : ''));
    button.type = 'button';
    button.append(el('span','mini',character.name[0]?.toUpperCase() || '?'),el('span','cut',character.name));
    button.addEventListener('click', () => void chooseCharacter(character.id));
    host.append(button);
  }
  if (!chars.length) host.append(el('p','emptyList', search ? 'No matching characters.' : 'No characters yet.'));
  $('newCharacterBtn').disabled = !state.novel;
}
function renderEmpty() {
  $('editor').classList.add('hidden'); $('emptyView').classList.remove('hidden');
  if (!state.novel) {
    $('emptyTitle').textContent = 'Start a novel';
    $('emptyDescription').textContent = 'Create a novel in ' + (state.writer?.name || 'your writer profile') + "'s library.";
    $('emptyAction').textContent = 'Create a novel';
    $('emptyAction').onclick = createNovel;
  } else {
    $('emptyTitle').textContent = 'Create your first character';
    $('emptyDescription').textContent = 'Profiles for ' + state.novel.name + ' will be saved in its own folder.';
    $('emptyAction').textContent = 'New character';
    $('emptyAction').onclick = createCharacter;
  }
  renderCharacterList();
}
async function chooseCharacter(id) {
  if (!(await flush())) { toast('Unsaved changes: retry saving before switching characters.', true); return; }
  const character = state.characters.find(c => c.id === id);
  if (!character) return;
  state.active = character; state.revision = 0; state.savedRevision = 0; state.epoch++;
  renderCharacterList(); renderEditor();
  status('Saved to folder');
}
const sections = [
  { key: 'basic', title: 'Basic Information', fields: [['fullName','Full name'],['age','Age / ages'],['occupation','Occupation'],['appearance','Physical appearance',true]] },
  { key: 'personality', title: 'Personality', fields: [['traits','Personality traits',true],['fears','Fears',true],['beliefs','Beliefs',true],['motivations','Motivations',true]] },
  { key: 'background', title: 'Background', fields: [['history','Personal history',true],['experiences','Significant experiences',true]] },
  { key: 'relationships', title: 'Relationships', fields: [] },
  { key: 'story', title: 'Story Information', fields: [['role','Role in the story'],['timeline','Timeline',true],['events','Important events',true]] },
  { key: 'freeform', title: 'Freeform Notes', fields: [] }
];
function makeField(label, value, update, long = false) {
  const container = el('div', 'field' + (long ? ' wide' : ''));
  const lab = el('label', '', label);
  const input = el(long ? 'textarea' : 'input');
  if (long) input.rows = 3;
  input.value = value ?? '';
  input.addEventListener('input', () => update(input.value));
  container.append(lab, input);
  return container;
}
function renderEditor() {
  const character = state.active;
  if (!character) return renderEmpty();
  $('emptyView').classList.add('hidden'); $('editor').classList.remove('hidden');
  $('characterName').textContent = character.name;
  $('lastSavedLabel').textContent = character.updatedAt ? 'Last saved ' + new Date(character.updatedAt).toLocaleString() : '';
  const host = $('sections'); host.replaceChildren();
  for (const section of sections) {
    character[section.key] ??= {};
    const details = el('details','section'); details.open = true;
    const summary = el('summary'); summary.append(el('span','',section.title),el('span','', '⌄'));
    const body = el('div','sectionBody');
    if (section.fields.length) {
      const grid = el('div','fields');
      for (const [key, label, long] of section.fields) {
        grid.append(makeField(label, character[section.key][key] || '', value => {
          character[section.key][key] = value;
          if (section.key === 'basic' && key === 'fullName') {
            character.name = value || 'Unnamed';
            $('characterName').textContent = character.name;
            renderCharacterList();
          }
          queueSave();
        }, !!long));
      }
      body.append(grid);
    }
    if (section.key === 'relationships') renderRelationships(body, character);
    const notes = el('div','notes');
    notes.append(makeField(section.key === 'freeform' ? 'Notes' : 'Additional notes', character[section.key].notes || '', value => {
      character[section.key].notes = value;
      queueSave();
    }, true));
    body.append(notes); details.append(summary, body); host.append(details);
  }
  void renderPortrait(character);
}
function relatedCharacters(character) {
  const own = character.relationships?.links || [];
  const incoming = state.characters.filter(other => other.id !== character.id && (other.relationships?.links || []).some(r => r.id === character.id)).map(other => ({ id: other.id, notes: '', incoming: true }));
  return [...own, ...incoming.filter(r => !own.some(o => o.id === r.id))].filter(r => state.characters.some(x => x.id === r.id));
}
function renderRelationships(host, character) {
  character.relationships.links ??= [];
  for (const link of relatedCharacters(character)) {
    const target = state.characters.find(c => c.id === link.id);
    const row = el('div','relationshipRow');
    const jump = el('button','linkButton', target.name); jump.type = 'button'; jump.onclick = () => void chooseCharacter(target.id); row.append(jump);
    const own = character.relationships.links.find(x => x.id === link.id);
    if (own) {
      const notes = el('textarea'); notes.placeholder = 'Notes from this character’s perspective…'; notes.value = own.notes || '';
      notes.addEventListener('input', () => { own.notes = notes.value; queueSave(); });
      row.append(notes);
      const remove = el('button','removeButton','Unlink'); remove.type = 'button';
      remove.onclick = () => { character.relationships.links = character.relationships.links.filter(x => x.id !== link.id); queueSave(); renderEditor(); };
      row.append(remove);
    } else {
      row.append(el('span','muted','Linked from '+target.name));
      const addOwn = el('button','quiet','Add my notes'); addOwn.type = 'button';
      addOwn.onclick = () => { character.relationships.links.push({ id: target.id, notes: '' }); queueSave(); renderEditor(); };
      row.append(addOwn);
    }
    host.append(row);
  }
  const picker = el('div','relationPicker'), select = el('select');
  select.append(new Option('Select character to link…',''));
  const linked = new Set(relatedCharacters(character).map(r => r.id));
  for (const c of state.characters.filter(c => c.id !== character.id && !linked.has(c.id))) select.add(new Option(c.name, c.id));
  const add = el('button','primary','Link character'); add.type = 'button'; add.disabled = select.options.length < 2;
  add.onclick = () => { if (!select.value) return; character.relationships.links.push({ id: select.value, notes: '' }); queueSave(); renderEditor(); };
  picker.append(select,add); host.append(picker);
  host.append(el('p','muted','Links appear on both profiles; each writer can add notes from either character’s perspective.'));
}
function cleanPortraitUrl() { if (state.portraitUrl) URL.revokeObjectURL(state.portraitUrl); state.portraitUrl = null; }
async function renderPortrait(character) {
  const frame = $('portrait');
  cleanPortraitUrl(); frame.replaceChildren(el('span','silhouette','♟'));
  if (!character.portraitFile || !state.portraitsDir) return;
  const epoch = state.epoch;
  try {
    const file = await (await state.portraitsDir.getFileHandle(character.portraitFile)).getFile();
    if (state.active !== character || epoch !== state.epoch) return;
    const url = URL.createObjectURL(file); state.portraitUrl = url;
    const img = el('img'); img.src = url; img.alt = 'Portrait of ' + character.name;
    frame.replaceChildren(img);
  } catch { /* show default silhouette if photo was removed */ }
}
async function uploadPortrait(event) {
  const file = event.target.files?.[0], character = state.active;
  event.target.value = '';
  if (!file || !character) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { toast('Choose a PNG, JPEG, or WebP image.', true); return; }
  if (file.size > 5 * 1024 * 1024) { toast('Portraits must be 5 MB or smaller.', true); return; }
  if (!(await flush())) return;
  try {
    status('Saving portrait…', 'busy');
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const filename = character.id + '.' + ext;
    await putFile(state.portraitsDir, filename, file);
    character.portraitFile = filename;
    queueSave();
    if (await flush()) { await renderPortrait(character); toast('Portrait saved to USB.'); }
  } catch (error) { status('Portrait save failed', 'bad'); toast('Could not save portrait: ' + error.message, true); }
}
async function removePortrait() {
  if (!state.active?.portraitFile) return;
  if (!confirm('Remove the portrait from this profile?')) return;
  state.active.portraitFile = null;
  queueSave();
  if (await flush()) await renderPortrait(state.active);
}
async function deleteCharacter() {
  const character = state.active;
  if (!character || !confirm(`Permanently delete ${character.name} from the USB folder? Backups are not affected.`)) return;
  if (!(await flush())) return;
  try {
    await state.charsDir.removeEntry(character._filename);
    state.characters = state.characters.filter(c => c.id !== character.id);
    state.active = null; state.epoch++;
    toast('Character deleted.');
    if (state.characters.length) await chooseCharacter(state.characters[0].id);
    else renderEmpty();
  } catch (error) { toast('Deletion failed: ' + error.message, true); }
}
function downloadUnsavedProfile() {
  const character = state.active;
  if (!character) return;
  const snapshot = { ...diskProfile(character), updatedAt: dateNow() };
  const blob = new Blob([JSON.stringify(snapshot, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = character._filename || folderSafe(character.name) + '.json';
  document.body.append(anchor);
  anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  toast('Downloaded a recovery copy. The USB file has not been updated.');
}
async function backupLibrary() {
  if (hasUnsaved() || state.saving) {
    toast('Finish saving before backing up. Then click Back up library again.', true);
    void flush();
    return;
  }
  if (typeof window.showDirectoryPicker !== 'function') return;
  let target;
  try { target = await window.showDirectoryPicker({ mode: 'readwrite' }); }
  catch (error) { if (error.name !== 'AbortError') toast('Backup cancelled: ' + error.message, true); return; }
  try {
    if (typeof state.root.isSameEntry === 'function' && await state.root.isSameEntry(target)) throw new Error('Choose a different folder for the backup.');
    if (typeof state.root.resolve !== 'function') throw new Error('Cannot verify that the backup destination is separate. Choose a supported Chrome or Edge version.');
    if (await state.root.resolve(target) !== null) throw new Error('The backup location must not be inside your active library.');
    if (typeof target.queryPermission === 'function' && await target.queryPermission({ mode: 'readwrite' }) !== 'granted') {
      if (await target.requestPermission({mode:'readwrite'}) !== 'granted') throw new Error('Write permission was not granted.');
    }
    const stamp = dateNow().replace(/[:.]/g,'-');
    const folder = await target.getDirectoryHandle('Character-Archive-Backup-' + stamp, {create:true});
    status('Backing up…', 'busy');
    await copyFolder(state.root, folder);
    status('Backup complete');
    toast('Backup copied successfully.');
  } catch (error) { status('Backup failed', 'bad'); toast('Backup could not finish: ' + error.message, true); }
}
async function copyFolder(source, dest) {
  for await (const [name, handle] of source.entries()) {
    if (handle.kind === 'directory') {
      const child = await dest.getDirectoryHandle(name, { create: true });
      await copyFolder(handle, child);
    } else if (handle.kind === 'file') {
      const file = await handle.getFile();
      const output = await dest.getFileHandle(name, { create: true });
      await writeHandle(output, file);
    }
  }
}
function init() {
  $('selectFolderBtn').onclick = selectFolder;
  $('reselectFolderBtn').onclick = selectFolder;
  $('changeFolderBtn').onclick = selectFolder;
  $('newWriterBtn').onclick = createWriter;
  $('switchWriterBtn').onclick = async () => {
    if (!(await flush())) return;
    state.writer = null; state.writerDir = null; state.novels = []; clearNovelState();
    renderWriterCards(); setStage('writer'); status('Choose writer');
  };
  $('newNovelBtn').onclick = createNovel;
  $('novelSelect').onchange = event => void chooseNovel(event.target.value);
  $('newCharacterBtn').onclick = createCharacter;
  $('searchInput').oninput = renderCharacterList;
  $('portraitInput').onchange = event => void uploadPortrait(event);
  $('removePortraitBtn').onclick = removePortrait;
  $('deleteCharacterBtn').onclick = deleteCharacter;
  $('retrySaveBtn').onclick = () => void flush();
  $('downloadUnsavedBtn').onclick = downloadUnsavedProfile;
  $('backupBtn').onclick = backupLibrary;
  window.addEventListener('beforeunload', event => {
    if (hasUnsaved() || !!state.saving) { event.preventDefault(); event.returnValue = ''; }
  });
  setStage('folder');
}
document.addEventListener('DOMContentLoaded', init);
