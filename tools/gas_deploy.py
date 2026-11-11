#!/usr/bin/env python3
"""Apps Script API で本番スクリプトを更新し、ウェブアプリのデプロイを新バージョンに切り替える。

使い方:
  GAS_TOKEN_FILE=<refresh_tokenを含むJSON> python3 tools/gas_deploy.py "更新の説明"
コード.gs は tools/build-update.js と同じく src/*.js を連結したもの。appsscript.json は本番のものを保つ。
"""
import json, os, sys, urllib.request, urllib.parse, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIENT_ID = '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com'  # clasp の公開クライアント
CLIENT_SECRET = 'v6V3fKV_zWU7iw1DrpO1rknX'


def token():
    t = json.load(open(os.environ['GAS_TOKEN_FILE']))
    body = urllib.parse.urlencode({'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET,
                                   'refresh_token': t['refresh_token'], 'grant_type': 'refresh_token'}).encode()
    return json.load(urllib.request.urlopen('https://oauth2.googleapis.com/token', body))['access_token']


def api(tok, method, path, body=None):
    req = urllib.request.Request('https://script.googleapis.com/v1/' + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        sys.exit('%s %s -> %s %s' % (method, path, e.code, e.read().decode()[:800]))


def build_code():
    files = sorted(f for f in os.listdir(os.path.join(ROOT, 'src')) if f.endswith('.js'))
    head = '/**\n * マンスリー周辺調査（自動生成：tools/build-update.js）\n * src/ の %d ファイルを1つにまとめたもの。修正は src/ で行うこと。\n */\n\n' % len(files)
    return head + '\n'.join('/* ======== %s ======== */\n' % f + open(os.path.join(ROOT, 'src', f), encoding='utf8').read() for f in files)


def main():
    note = sys.argv[1] if len(sys.argv) > 1 else '更新'
    d = json.load(open(os.path.join(ROOT, 'dist', 'deploy.json')))
    sid = d['scriptId']
    dep_id = d.get('deploymentId') or d['webAppUrl'].split('/s/')[1].split('/')[0]
    tok = token()
    cur = api(tok, 'GET', 'projects/%s/content' % sid)
    manifest = [f for f in cur['files'] if f['name'] == 'appsscript'][0]
    files = [manifest,
             {'name': 'コード', 'type': 'SERVER_JS', 'source': build_code()},
             {'name': 'App', 'type': 'HTML', 'source': open(os.path.join(ROOT, 'src', 'App.html'), encoding='utf8').read()}]
    api(tok, 'PUT', 'projects/%s/content' % sid, {'files': files})
    ver = api(tok, 'POST', 'projects/%s/versions' % sid, {'description': note})['versionNumber']
    dep = api(tok, 'GET', 'projects/%s/deployments/%s' % (sid, dep_id))
    cfg = dep['deploymentConfig']
    cfg['versionNumber'] = ver
    cfg['description'] = note
    api(tok, 'PUT', 'projects/%s/deployments/%s' % (sid, dep_id), {'deploymentConfig': cfg})
    print('deployed version', ver)


if __name__ == '__main__':
    main()
