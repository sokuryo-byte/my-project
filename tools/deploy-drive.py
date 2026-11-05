#!/usr/bin/env python3
"""
Google ドライブに本番環境を作る（または更新する）。

  1. フォルダ「マンスリー周辺調査」と、その中に「マイソクPDF」フォルダ
  2. スプレッドシート「マンスリー周辺調査（データ）」
  3. Apps Script プロジェクト「マンスリー周辺調査（プログラム）」
     src/*.js を1ファイルにまとめ、BOOTSTRAP にスプレッドシートIDとフォルダIDを書き込む

使い方:
  ACCESS_TOKEN=$(gcloud auth print-access-token) python3 tools/deploy-drive.py          # 新規作成
  ACCESS_TOKEN=... python3 tools/deploy-drive.py --recreate   # プログラムを最新版で作り直す（初回実行前に使う）
  ACCESS_TOKEN=... python3 tools/deploy-drive.py --update <scriptFileId>   # 内容だけ更新（drive.scripts 権限が必要）
結果（各ID・URL）は dist/deploy.json に保存する（.gitignore 対象）。
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = os.environ.get('ACCESS_TOKEN', '')
if not TOKEN:
    sys.exit('ACCESS_TOKEN が必要です')


def api(method, url, body=None, multipart=None):
    cmd = ['curl', '-sS', '-X', method, '-H', 'Authorization: Bearer ' + TOKEN]
    if multipart:
        boundary = 'deploy-boundary-7c1f'
        meta, media, media_type = multipart
        payload = ('--{b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{m}\r\n'
                   '--{b}\r\nContent-Type: {t}\r\n\r\n{d}\r\n--{b}--').format(
            b=boundary, m=json.dumps(meta, ensure_ascii=False), t=media_type, d=media)
        cmd += ['-H', 'Content-Type: multipart/related; boundary=' + boundary, '--data-binary', '@-']
        res = subprocess.run(cmd + [url], input=payload.encode('utf-8'), capture_output=True)
    else:
        if body is not None:
            cmd += ['-H', 'Content-Type: application/json; charset=UTF-8', '--data-binary', '@-']
        res = subprocess.run(cmd + [url], input=(json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None), capture_output=True)
    out = json.loads(res.stdout or b'{}')
    if 'error' in out:
        raise SystemExit('API エラー: ' + json.dumps(out['error'], ensure_ascii=False))
    return out


def build_script_files(bootstrap):
    src = os.path.join(ROOT, 'src')
    names = sorted(f for f in os.listdir(src) if f.endswith('.js'))
    code = ''.join('/* ======== %s ======== */\n%s\n' % (f, open(os.path.join(src, f), encoding='utf-8').read()) for f in names)
    marker = "var BOOTSTRAP = { spreadsheetId: '', mysokuFolderId: '' };"
    assert marker in code, 'BOOTSTRAP の定義が見つかりません'
    code = code.replace(marker, 'var BOOTSTRAP = %s;' % json.dumps(bootstrap))
    header = '/**\n * マンスリー周辺調査（自動生成：tools/deploy-drive.py）\n * src/ の %d ファイルを1つにまとめたもの。修正は src/ で行い、再度 deploy すること。\n */\n\n' % len(names)
    return {'files': [
        {'name': 'コード', 'type': 'server_js', 'source': header + code},
        {'name': 'App', 'type': 'html', 'source': open(os.path.join(src, 'App.html'), encoding='utf-8').read()},
        {'name': 'appsscript', 'type': 'json', 'source': open(os.path.join(src, 'appsscript.json'), encoding='utf-8').read()},
    ]}


def main():
    state_path = os.path.join(ROOT, 'dist', 'deploy.json')
    state = json.load(open(state_path)) if os.path.exists(state_path) else {}
    if '--recreate' in sys.argv:
        # 内容の更新には drive.scripts 権限が要るため、古いプログラムをゴミ箱に移して作り直す
        api('PATCH', 'https://www.googleapis.com/drive/v3/files/%s' % state['scriptId'], {'trashed': True})
        files = build_script_files({'spreadsheetId': state['spreadsheetId'], 'mysokuFolderId': state['mysokuFolderId']})
        script = api('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
                     multipart=({'name': 'マンスリー周辺調査（プログラム）', 'mimeType': 'application/vnd.google-apps.script', 'parents': [state['folderId']]},
                                json.dumps(files, ensure_ascii=False), 'application/vnd.google-apps.script+json'))
        state['scriptId'] = script['id']
        state['scriptUrl'] = 'https://script.google.com/d/%s/edit' % script['id']
        json.dump(state, open(state_path, 'w'), ensure_ascii=False, indent=2)
        print('プログラムを作り直しました:', state['scriptUrl'])
        return
    if '--update' in sys.argv:
        sid = sys.argv[sys.argv.index('--update') + 1]
        files = build_script_files({'spreadsheetId': state['spreadsheetId'], 'mysokuFolderId': state['mysokuFolderId']})
        api('PATCH', 'https://www.googleapis.com/upload/drive/v3/files/%s?uploadType=multipart&fields=id,name' % sid,
            multipart=({}, json.dumps(files, ensure_ascii=False), 'application/vnd.google-apps.script+json'))
        print('プログラムを更新しました:', sid)
        return

    folder = api('POST', 'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink',
                 {'name': 'マンスリー周辺調査', 'mimeType': 'application/vnd.google-apps.folder'})
    mysoku = api('POST', 'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink',
                 {'name': 'マイソクPDF', 'mimeType': 'application/vnd.google-apps.folder', 'parents': [folder['id']]})
    sheet = api('POST', 'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink',
                {'name': 'マンスリー周辺調査（データ）', 'mimeType': 'application/vnd.google-apps.spreadsheet', 'parents': [folder['id']]})
    files = build_script_files({'spreadsheetId': sheet['id'], 'mysokuFolderId': mysoku['id']})
    script = api('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
                 multipart=({'name': 'マンスリー周辺調査（プログラム）', 'mimeType': 'application/vnd.google-apps.script', 'parents': [folder['id']]},
                            json.dumps(files, ensure_ascii=False), 'application/vnd.google-apps.script+json'))
    state = {
        'folderId': folder['id'], 'folderUrl': folder.get('webViewLink'),
        'mysokuFolderId': mysoku['id'], 'mysokuFolderUrl': mysoku.get('webViewLink'),
        'spreadsheetId': sheet['id'], 'spreadsheetUrl': sheet.get('webViewLink'),
        'scriptId': script['id'], 'scriptUrl': 'https://script.google.com/d/%s/edit' % script['id'],
    }
    os.makedirs(os.path.dirname(state_path), exist_ok=True)
    json.dump(state, open(state_path, 'w'), ensure_ascii=False, indent=2)
    print(json.dumps(state, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
