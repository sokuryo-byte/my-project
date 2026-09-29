/**
 * ============================================================
 *  添付資料（Google ドライブ）
 * ============================================================
 *  流れ：
 *   1) 画面でファイルをドラッグ → すぐに「_受付中（未送信）」フォルダへアップロード
 *   2) 送信時に、案件ごとのフォルダ（例：0042_豊田市_123番1）へ移動し、ファイル名に資料種別を付ける
 *   3) 送信されずに残った一時ファイルは、メニューから一括削除できる
 *  ファイルはWebアプリをデプロイしたアカウントのドライブに保存されます。
 */

/** 資料保存用のルートフォルダ（無ければ作成してIDを記録） */
function getRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = DRIVE_ROOT_FOLDER_ID || props.getProperty('DRIVE_ROOT_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);

  const folder = DriveApp.createFolder('農地転用_案件資料');
  props.setProperty('DRIVE_ROOT_FOLDER_ID', folder.getId());
  return folder;
}

/** 送信前ファイルを置く一時フォルダ（ルート直下。無ければ作成） */
function getPendingFolder_() {
  const root = getRootFolder_();
  const it = root.getFoldersByName(DRIVE_PENDING_FOLDER_NAME);
  return it.hasNext() ? it.next() : root.createFolder(DRIVE_PENDING_FOLDER_NAME);
}

/**
 * 画面から受け取ったファイルを一時フォルダに保存する。
 * @param {{name:string, mimeType:string, data:string}} file data は Base64
 * @return {{fileId:string, name:string, size:number}}
 */
function saveUploadedFile_(file) {
  const mimeType = String(file && file.mimeType || '');
  if (ALLOWED_MIME_TYPES.indexOf(mimeType) < 0) {
    throw new Error('この形式のファイルはアップロードできません（PDF・画像のみ）：' + (file && file.name));
  }
  const bytes = Utilities.base64Decode(String(file.data || ''));
  if (bytes.length > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error('ファイルサイズが上限（' + MAX_UPLOAD_MB + 'MB）を超えています：' + file.name);
  }
  const name = sanitizeFileName_(file.name);
  const saved = getPendingFolder_().createFile(Utilities.newBlob(bytes, mimeType, name));
  saved.setDescription('アップロード者：' + getUserEmail_());
  return { fileId: saved.getId(), name: name, size: bytes.length };
}

/**
 * 一時フォルダ内のファイルだけを取得する。
 * デプロイ者のドライブにある他のファイルを画面から操作されないよう、必ずここを通す。
 */
function getPendingFileOrNull_(fileId) {
  try {
    const file = DriveApp.getFileById(String(fileId));
    const pendingId = getPendingFolder_().getId();
    const parents = file.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === pendingId) return file;
    }
  } catch (e) {
    // IDが不正・削除済みなど
  }
  return null;
}

/** 送信前に取り消したファイルをゴミ箱へ移動する */
function trashPendingFile_(fileId) {
  const file = getPendingFileOrNull_(fileId);
  if (file) file.setTrashed(true);
  return true;
}

/**
 * 案件フォルダを作り、一時フォルダのファイルを移動する。
 * @param {number} caseId
 * @param {Object} input normalizeInput_() の結果
 * @return {{folderUrl:string, count:number, errors:string[]}}
 */
function attachFilesToCase_(caseId, input) {
  const first = input.lots[0] || { municipality: '', address: '', lotNumber: '' };
  const folderName = [('0000' + caseId).slice(-4), first.municipality || first.address.slice(0, 20),
    first.lotNumber + (input.lots.length > 1 ? '他' + (input.lots.length - 1) + '筆' : '')]
    .filter(String).join('_');
  const folder = getRootFolder_().createFolder(sanitizeFileName_(folderName));
  const errors = [];
  let count = 0;

  input.attachments.forEach(function (a) {
    const file = getPendingFileOrNull_(a.fileId);
    if (!file) {
      errors.push('ファイルが見つかりません（' + a.fileId + '）');
      return;
    }
    file.setName('[' + a.docType + '] ' + file.getName());
    file.moveTo(folder);
    count++;
  });
  return { folderUrl: folder.getUrl(), count: count, errors: errors };
}

/** 7日以上前に一時フォルダへアップロードされ、送信されなかったファイルを削除する（メニューから実行） */
function cleanupPendingUploads() {
  const limit = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const files = getPendingFolder_().getFiles();
  let n = 0;
  while (files.hasNext()) {
    const f = files.next();
    if (f.getDateCreated() < limit) {
      f.setTrashed(true);
      n++;
    }
  }
  notifyUser_(n + '件の未送信ファイルをゴミ箱へ移動しました。');
}

/** ファイル名・フォルダ名に使えない文字を除去する */
function sanitizeFileName_(name) {
  const s = String(name || 'file').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return s.slice(0, 120) || 'file';
}
