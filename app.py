import os
import sys
import json
import base64
import shutil
import zipfile
import tempfile
import subprocess
import threading
import webbrowser
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory

def _base_dir():
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent
    return Path(__file__).parent.resolve()

def _frontend_dir():
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS) / 'frontend'
    return Path(__file__).parent.resolve() / 'frontend'

BASE_DIR = _base_dir()
PAST_PROJECTS = BASE_DIR / 'past_projects_useless'
FRONTEND_DIR = _frontend_dir()
DATA_FILE = BASE_DIR / 'account_data.json'
PORT = 9876

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path='')

PAST_PROJECTS.mkdir(exist_ok=True)

import requests as req

def _http(method, url, **kw):
    kw.setdefault('headers', {})
    kw['headers'].setdefault('User-Agent', 'e-git')
    kw.setdefault('timeout', 30)
    return req.request(method, url, **kw)

def get_token():
    if DATA_FILE.exists():
        try:
            data = json.loads(DATA_FILE.read_text('utf-8'))
            return data.get('token')
        except Exception:
            return None
    return None

def save_account(token, username, email):
    DATA_FILE.write_text(json.dumps({
        'token': token,
        'username': username,
        'email': email
    }), 'utf-8')

def clear_account():
    if DATA_FILE.exists():
        DATA_FILE.unlink()

# ----------------------- Static -----------------------
@app.route('/')
def index():
    return send_from_directory(str(FRONTEND_DIR), 'index.html')

# ----------------------- Account -----------------------
@app.route('/api/account/status')
def account_status():
    token = get_token()
    if not token:
        return jsonify({'success': True, 'data': {'isBound': False}})
    try:
        r = _http('GET', 'https://api.github.com/user', headers={'Authorization': f'token {token}'})
        if r.status_code == 200:
            user = r.json()
            return jsonify({'success': True, 'data': {
                'isBound': True,
                'username': user.get('login'),
                'email': user.get('email', '')
            }})
        else:
            clear_account()
            return jsonify({'success': True, 'data': {'isBound': False}})
    except Exception:
        return jsonify({'success': True, 'data': {'isBound': False}})

@app.route('/api/account/bind', methods=['POST'])
def account_bind():
    data = request.get_json()
    token = data.get('token', '').strip()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    if not token:
        return jsonify({'success': False, 'message': 'Token 不能为空'})
    try:
        r = _http('GET', 'https://api.github.com/user', headers={'Authorization': f'token {token}'})
        if r.status_code == 200:
            save_account(token, username, email)
            return jsonify({'success': True, 'message': '绑定成功'})
        return jsonify({'success': False, 'message': 'Token 验证失败'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'绑定失败：{e}'})

@app.route('/api/account/rebind', methods=['POST'])
def account_rebind():
    clear_account()
    return account_bind()

# ----------------------- Repos -----------------------
@app.route('/api/repos/list')
def repos_list():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    try:
        repos = []
        page = 1
        while True:
            r = _http('GET', f'https://api.github.com/user/repos?per_page=100&page={page}',
                       headers={'Authorization': f'token {token}'})
            if r.status_code != 200:
                break
            batch = r.json()
            if not batch:
                break
            for repo in batch:
                repos.append({
                    'name': repo.get('name'),
                    'description': repo.get('description'),
                    'isPrivate': repo.get('private'),
                    'defaultBranch': repo.get('default_branch'),
                    'language': repo.get('language'),
                    'stars': repo.get('stargazers_count'),
                    'forks': repo.get('forks_count')
                })
            page += 1
            if len(batch) < 100:
                break
        return jsonify({'success': True, 'data': repos})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/repos/create', methods=['POST'])
def repos_create():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    data = request.get_json()
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()
    is_private = data.get('isPrivate', False)
    if not name:
        return jsonify({'success': False, 'message': '仓库名不能为空'})
    try:
        r = _http('POST', 'https://api.github.com/user/repos', headers={'Authorization': f'token {token}'},
                   json={'name': name, 'description': description, 'private': is_private})
        if r.status_code in (201, 200):
            return jsonify({'success': True, 'message': '仓库创建成功'})
        return jsonify({'success': False, 'message': r.json().get('message', '创建失败')})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/repos/delete', methods=['POST'])
def repos_delete():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    data = request.get_json()
    repo_name = data.get('repoName', '').strip()
    if not repo_name:
        return jsonify({'success': False, 'message': '仓库名不能为空'})
    try:
        username = json.loads(DATA_FILE.read_text('utf-8')).get('username', '')
        owner = username or _get_login(token)
        r = _http('DELETE', f'https://api.github.com/repos/{owner}/{repo_name}',
                   headers={'Authorization': f'token {token}'})
        if r.status_code == 204:
            past_dir = PAST_PROJECTS / repo_name
            if past_dir.exists():
                shutil.rmtree(past_dir)
            return jsonify({'success': True, 'message': '仓库已删除'})
        return jsonify({'success': False, 'message': r.json().get('message', '删除失败')})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

def _get_login(token):
    r = _http('GET', 'https://api.github.com/user', headers={'Authorization': f'token {token}'})
    if r.status_code == 200:
        return r.json().get('login', '')
    return ''

# ----------------------- Upload -----------------------
@app.route('/api/upload/check', methods=['POST'])
def upload_check():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    data = request.get_json()
    repo_name = data.get('repoName', '').strip()
    branch = data.get('branch', 'main').strip()
    username = json.loads(DATA_FILE.read_text('utf-8')).get('username', '')
    owner = username or _get_login(token)
    r = _http('GET', f'https://api.github.com/repos/{owner}/{repo_name}',
               headers={'Authorization': f'token {token}'})
    if r.status_code != 200:
        return jsonify({'success': False, 'message': f'仓库 {repo_name} 不存在'})
    r2 = _http('GET', f'https://api.github.com/repos/{owner}/{repo_name}/branches/{branch}',
                headers={'Authorization': f'token {token}'})
    if r2.status_code != 200:
        return jsonify({'success': False, 'message': f'分支 {branch} 不存在'})
    r3 = _http('GET', f'https://api.github.com/repos/{owner}/{repo_name}/contents?ref={branch}',
                headers={'Authorization': f'token {token}'})
    isEmpty = False
    if r3.status_code == 200 and isinstance(r3.json(), list) and len(r3.json()) == 0:
        isEmpty = True
    return jsonify({'success': True, 'message': '验证通过', 'data': {'isEmpty': isEmpty}})

@app.route('/api/upload/upload-folders', methods=['POST'])
def upload_folders():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    repo_name = request.form.get('repoName', '').strip()
    branch = request.form.get('branch', 'main').strip()
    commit_msg = request.form.get('commitMessage', 'Upload via e-git').strip()
    if not repo_name:
        return jsonify({'success': False, 'message': '仓库名不能为空'})
    username = json.loads(DATA_FILE.read_text('utf-8')).get('username', '')
    owner = username or _get_login(token)
    files = request.files.getlist('files')
    if not files:
        return jsonify({'success': False, 'message': '没有选择文件'})
    total = len(files)
    uploaded = 0
    failed = []
    existing = _list_repo_files(token, owner, repo_name, branch)
    for f in files:
        try:
            rel_path = f.filename.replace('\\', '/')
            content_bytes = f.read()
            old_sha = existing.get(rel_path)
            if old_sha:
                old_content = _get_file_content(token, owner, repo_name, rel_path, branch)
                if old_content and old_content == content_bytes:
                    uploaded += 1
                    continue
                _save_to_past(repo_name, rel_path, old_content or b'')
            result = _create_or_update_file(token, owner, repo_name, rel_path, content_bytes, commit_msg, branch, old_sha)
            if result['success']:
                uploaded += 1
            else:
                failed.append(rel_path)
        except Exception as e:
            failed.append(f'{f.filename}: {e}')
    return jsonify({'success': True, 'message': f'上传完成：{uploaded}/{total} 个文件成功',
                     'data': {'total': total, 'uploaded': uploaded, 'failed': failed}})

def _list_repo_files(token, owner, repo, branch, path=''):
    result = {}
    r = _http('GET', f'https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}',
               headers={'Authorization': f'token {token}'})
    if r.status_code != 200:
        return result
    items = r.json()
    if isinstance(items, list):
        for item in items:
            if item.get('type') == 'file':
                result[item.get('path')] = item.get('sha')
            elif item.get('type') == 'dir':
                sub = _list_repo_files(token, owner, repo, branch, item.get('path'))
                result.update(sub)
    return result

def _get_file_content(token, owner, repo, path, branch):
    r = _http('GET', f'https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}',
               headers={'Authorization': f'token {token}'})
    if r.status_code == 200:
        item = r.json()
        content = item.get('content', '')
        if content:
            try:
                return base64.b64decode(content)
            except Exception:
                return None
    return None

def _create_or_update_file(token, owner, repo, path, content_bytes, message, branch, sha=None):
    payload = {
        'message': message,
        'content': base64.b64encode(content_bytes).decode('utf-8'),
        'branch': branch
    }
    if sha:
        payload['sha'] = sha
    r = _http('PUT', f'https://api.github.com/repos/{owner}/{repo}/contents/{path}',
               headers={'Authorization': f'token {token}'}, json=payload)
    if r.status_code in (200, 201):
        return {'success': True}
    return {'success': False, 'message': r.json().get('message', '')}

def _save_to_past(repo_name, filename, content):
    try:
        repo_dir = PAST_PROJECTS / repo_name
        repo_dir.mkdir(exist_ok=True)
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        save_path = repo_dir / f'{ts}_{Path(filename).name}'
        save_path.write_bytes(content)
    except Exception:
        pass

# ----------------------- Branches -----------------------
@app.route('/api/branches/list')
def branches_list():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    repo_name = request.args.get('repoName', '').strip()
    if not repo_name:
        return jsonify({'success': False, 'message': '仓库名不能为空'})
    username = json.loads(DATA_FILE.read_text('utf-8')).get('username', '')
    owner = username or _get_login(token)
    try:
        r = _http('GET', f'https://api.github.com/repos/{owner}/{repo_name}/branches',
                   headers={'Authorization': f'token {token}'})
        if r.status_code == 200:
            branches = [{'name': b['name'], 'sha': b['commit']['sha'][:7], 'fullSha': b['commit']['sha']} for b in r.json()]
            return jsonify({'success': True, 'data': branches})
        return jsonify({'success': False, 'message': r.json().get('message', '获取失败')})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/branches/graph')
def branches_graph():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    repo_name = request.args.get('repoName', '').strip()
    if not repo_name:
        return jsonify({'success': False, 'message': '仓库名不能为空'})
    username = json.loads(DATA_FILE.read_text('utf-8')).get('username', '')
    owner = username or _get_login(token)
    try:
        r = _http('GET', f'https://api.github.com/repos/{owner}/{repo_name}/branches',
                   headers={'Authorization': f'token {token}'})
        if r.status_code != 200:
            return jsonify({'success': False, 'message': '获取分支失败'})
        branches_data = r.json()

        repo_r = _http('GET', f'https://api.github.com/repos/{owner}/{repo_name}',
                        headers={'Authorization': f'token {token}'})
        default_branch = 'main'
        if repo_r.status_code == 200:
            default_branch = repo_r.json().get('default_branch', 'main')

        all_commits = {}
        branch_head_shas = {}

        for b in branches_data:
            branch_name = b['name']
            branch_sha = b['commit']['sha']
            branch_head_shas[branch_name] = branch_sha

            cr = _http('GET', f'https://api.github.com/repos/{owner}/{repo_name}/commits?sha={branch_name}&per_page=30',
                        headers={'Authorization': f'token {token}'})
            if cr.status_code == 200:
                for c in cr.json():
                    sha = c['sha']
                    parents = [p['sha'] for p in c.get('parents', [])]
                    commit_info = c.get('commit', {})
                    author_info = commit_info.get('author', {})
                    if sha not in all_commits:
                        all_commits[sha] = {
                            'sha': sha[:7],
                            'fullSha': sha,
                            'message': commit_info.get('message', '').split('\n')[0],
                            'author': author_info.get('name', ''),
                            'date': commit_info.get('author', {}).get('date', ''),
                            'parents': parents,
                            'branches': set()
                        }
                    all_commits[sha]['branches'].add(branch_name)

        branch_lane = {}
        lane = 0
        branch_list = []
        sorted_branches = sorted(branches_data, key=lambda b: (0 if b['name'] == default_branch else 1, b['name']))
        for b in sorted_branches:
            name = b['name']
            branch_lane[name] = lane
            branch_list.append({
                'name': name,
                'sha': branch_head_shas[name][:7],
                'fullSha': branch_head_shas[name],
                'isDefault': name == default_branch,
                'lane': lane
            })
            lane += 1

        for v in all_commits.values():
            v['branches'] = list(v['branches'])

        commits_sorted = sorted(all_commits.values(), key=lambda x: x['date'], reverse=True)

        graph_nodes = []
        for c in commits_sorted:
            primary_branch = c['branches'][0] if c['branches'] else default_branch
            c_lane = branch_lane.get(primary_branch, 0)
            connections = []
            for p_sha in c.get('parents', []):
                if p_sha in all_commits:
                    p_branches = all_commits[p_sha].get('branches', [])
                    p_primary = p_branches[0] if p_branches else primary_branch
                    p_lane = branch_lane.get(p_primary, 0)
                    if p_lane != c_lane:
                        connections.append({'parentFullSha': p_sha, 'parentSha': p_sha[:7], 'lane': p_lane})

            graph_nodes.append({
                'sha': c['sha'],
                'fullSha': c['fullSha'],
                'message': c['message'],
                'author': c['author'],
                'date': c['date'],
                'branch': primary_branch,
                'branches': c['branches'],
                'lane': c_lane,
                'connections': connections
            })

        rollback_info = _get_rollback(owner, repo_name, default_branch)
        head_sha = branch_head_shas.get(default_branch, '')
        if rollback_info:
            head_sha = rollback_info['targetFullSha']

        return jsonify({'success': True, 'data': {
            'branches': branch_list,
            'nodes': graph_nodes,
            'defaultBranch': default_branch,
            'laneCount': len(branch_list),
            'headSha': head_sha,
            'rollbackInfo': rollback_info
        }})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/branches/commit-detail')
def branches_commit_detail():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    repo_name = request.args.get('repoName', '').strip()
    sha = request.args.get('sha', '').strip()
    if not repo_name or not sha:
        return jsonify({'success': False, 'message': '仓库名和提交SHA不能为空'})
    username = json.loads(DATA_FILE.read_text('utf-8')).get('username', '')
    owner = username or _get_login(token)
    try:
        cr = _http('GET', f'https://api.github.com/repos/{owner}/{repo_name}/commits/{sha}',
                    headers={'Authorization': f'token {token}'})
        if cr.status_code != 200:
            return jsonify({'success': False, 'message': '获取提交详情失败'})
        commit_data = cr.json()

        author_login = commit_data.get('author', {}).get('login')
        location = ''
        if author_login:
            ur = _http('GET', f'https://api.github.com/users/{author_login}',
                        headers={'Authorization': f'token {token}'})
            if ur.status_code == 200:
                location = ur.json().get('location') or ''

        files = []
        for f in commit_data.get('files', []):
            files.append({
                'filename': f.get('filename'),
                'status': f.get('status'),
                'additions': f.get('additions', 0),
                'deletions': f.get('deletions', 0),
                'patch': f.get('patch', '')
            })

        commit_info = commit_data.get('commit', {})
        author = commit_info.get('author', {})

        return jsonify({'success': True, 'data': {
            'sha': commit_data.get('sha', sha)[:7],
            'fullSha': commit_data.get('sha', sha),
            'message': commit_info.get('message', ''),
            'author': {
                'name': author.get('name', ''),
                'email': author.get('email', ''),
                'login': author_login,
                'location': location
            },
            'date': author.get('date', ''),
            'stats': commit_data.get('stats', {}),
            'files': files
        }})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/branches/create', methods=['POST'])
def branches_create():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    data = request.get_json()
    repo_name = data.get('repoName', '').strip()
    branch_name = data.get('branchName', '').strip()
    source_branch = data.get('sourceBranch', 'main').strip()
    if not repo_name or not branch_name:
        return jsonify({'success': False, 'message': '仓库名和分支名不能为空'})
    username = json.loads(DATA_FILE.read_text('utf-8')).get('username', '')
    owner = username or _get_login(token)
    try:
        r = _http('GET', f'https://api.github.com/repos/{owner}/{repo_name}/git/ref/heads/{source_branch}',
                   headers={'Authorization': f'token {token}'})
        if r.status_code != 200:
            return jsonify({'success': False, 'message': f'源分支 {source_branch} 不存在'})
        sha = r.json()['object']['sha']
        r2 = _http('POST', f'https://api.github.com/repos/{owner}/{repo_name}/git/refs',
                    headers={'Authorization': f'token {token}'},
                    json={'ref': f'refs/heads/{branch_name}', 'sha': sha})
        if r2.status_code == 201:
            return jsonify({'success': True, 'message': '分支创建成功'})
        return jsonify({'success': False, 'message': r2.json().get('message', '创建失败')})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/branches/delete', methods=['POST'])
def branches_delete():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    data = request.get_json()
    repo_name = data.get('repoName', '').strip()
    branch_name = data.get('branchName', '').strip()
    if not repo_name or not branch_name:
        return jsonify({'success': False, 'message': '仓库名和分支名不能为空'})
    username = json.loads(DATA_FILE.read_text('utf-8')).get('username', '')
    owner = username or _get_login(token)
    try:
        r = _http('DELETE', f'https://api.github.com/repos/{owner}/{repo_name}/git/refs/heads/{branch_name}',
                   headers={'Authorization': f'token {token}'})
        if r.status_code == 204:
            return jsonify({'success': True, 'message': '分支已删除'})
        return jsonify({'success': False, 'message': r.json().get('message', '删除失败')})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/branches/merge', methods=['POST'])
def branches_merge():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    data = request.get_json()
    repo_name = data.get('repoName', '').strip()
    base_branch = data.get('baseBranch', '').strip()
    head_branch = data.get('headBranch', '').strip()
    commit_msg = data.get('commitMessage', f'Merge {head_branch} into {base_branch}').strip()
    if not repo_name or not base_branch or not head_branch:
        return jsonify({'success': False, 'message': '仓库名、当前分支和目标分支不能为空'})
    username = json.loads(DATA_FILE.read_text('utf-8')).get('username', '')
    owner = username or _get_login(token)
    try:
        r = _http('POST', f'https://api.github.com/repos/{owner}/{repo_name}/merges',
                   headers={'Authorization': f'token {token}'},
                   json={'base': base_branch, 'head': head_branch, 'commit_message': commit_msg})
        if r.status_code in (200, 201):
            return jsonify({'success': True, 'message': '分支合并成功'})
        return jsonify({'success': False, 'message': r.json().get('message', '合并失败')})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

# ----------------------- Version -----------------------
ROLLBACK_FILE = BASE_DIR / 'rollback_history.json'

@app.route('/api/version/commits')
def version_commits():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    repo_name = request.args.get('repoName', '').strip()
    per_page = request.args.get('perPage', '30')
    branch = request.args.get('branch', '')
    if not repo_name:
        return jsonify({'success': False, 'message': '仓库名不能为空'})
    username = json.loads(DATA_FILE.read_text('utf-8')).get('username', '')
    owner = username or _get_login(token)
    try:
        if not branch:
            repo_r = _http('GET', f'https://api.github.com/repos/{owner}/{repo_name}',
                            headers={'Authorization': f'token {token}'})
            if repo_r.status_code == 200:
                branch = repo_r.json().get('default_branch', 'main')
            else:
                branch = 'main'

        r = _http('GET', f'https://api.github.com/repos/{owner}/{repo_name}/commits?sha={branch}&per_page={per_page}',
                   headers={'Authorization': f'token {token}'})
        if r.status_code == 200:
            commits = []
            for c in r.json():
                commits.append({
                    'sha': c['sha'][:7],
                    'fullSha': c['sha'],
                    'message': c['commit']['message'],
                    'author': c['commit']['author']['name'],
                    'date': c['commit']['author']['date'],
                    'parents': [p['sha'][:7] for p in c.get('parents', [])],
                    'parentFullShas': [p['sha'] for p in c.get('parents', [])]
                })
            rollback_info = _get_rollback(owner, repo_name, branch)
            return jsonify({'success': True, 'data': commits, 'branch': branch, 'canRestore': rollback_info is not None, 'rollbackTarget': rollback_info})
        return jsonify({'success': False, 'message': r.json().get('message', '获取失败')})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/version/rollback', methods=['POST'])
def version_rollback():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    data = request.get_json()
    repo_name = data.get('repoName', '').strip()
    target_sha = data.get('targetSha', '').strip()
    branch = data.get('branch', 'main').strip()
    if not repo_name or not target_sha:
        return jsonify({'success': False, 'message': '仓库名和目标提交不能为空'})
    username = json.loads(DATA_FILE.read_text('utf-8')).get('username', '')
    owner = username or _get_login(token)
    try:
        ref_r = _http('GET', f'https://api.github.com/repos/{owner}/{repo_name}/git/ref/heads/{branch}',
                       headers={'Authorization': f'token {token}'})
        if ref_r.status_code != 200:
            return jsonify({'success': False, 'message': f'分支 {branch} 不存在'})
        current_sha = ref_r.json()['object']['sha']

        update_r = _http('PATCH', f'https://api.github.com/repos/{owner}/{repo_name}/git/refs/heads/{branch}',
                          headers={'Authorization': f'token {token}'},
                          json={'sha': target_sha, 'force': True})
        if update_r.status_code != 200:
            return jsonify({'success': False, 'message': update_r.json().get('message', '回滚失败')})

        _save_rollback(owner, repo_name, branch, current_sha[:7], current_sha, target_sha[:7], target_sha)
        return jsonify({'success': True, 'message': f'已回滚到 {target_sha[:7]}，可从还原按钮恢复'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/version/restore', methods=['POST'])
def version_restore():
    token = get_token()
    if not token:
        return jsonify({'success': False, 'message': '请先绑定账号'})
    data = request.get_json()
    repo_name = data.get('repoName', '').strip()
    branch = data.get('branch', 'main').strip()
    if not repo_name:
        return jsonify({'success': False, 'message': '仓库名不能为空'})
    username = json.loads(DATA_FILE.read_text('utf-8')).get('username', '')
    owner = username or _get_login(token)
    try:
        rollback_info = _get_rollback(owner, repo_name, branch)
        if not rollback_info:
            return jsonify({'success': False, 'message': '没有可还原的回滚记录'})

        restore_sha = rollback_info['originalFullSha']
        update_r = _http('PATCH', f'https://api.github.com/repos/{owner}/{repo_name}/git/refs/heads/{branch}',
                          headers={'Authorization': f'token {token}'},
                          json={'sha': restore_sha, 'force': True})
        if update_r.status_code != 200:
            return jsonify({'success': False, 'message': update_r.json().get('message', '还原失败')})

        _clear_rollback(owner, repo_name, branch)
        return jsonify({'success': True, 'message': f'已还原到 {restore_sha[:7]}'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

def _get_rollback(owner, repo_name, branch):
    if not ROLLBACK_FILE.exists():
        return None
    try:
        data = json.loads(ROLLBACK_FILE.read_text('utf-8'))
        key = f'{owner}/{repo_name}/{branch}'
        return data.get(key)
    except Exception:
        return None

def _save_rollback(owner, repo_name, branch, original_sha_short, original_full_sha, target_sha_short, target_full_sha):
    data = {}
    if ROLLBACK_FILE.exists():
        try:
            data = json.loads(ROLLBACK_FILE.read_text('utf-8'))
        except Exception:
            pass
    key = f'{owner}/{repo_name}/{branch}'
    data[key] = {
        'originalSha': original_sha_short,
        'originalFullSha': original_full_sha,
        'targetSha': target_sha_short,
        'targetFullSha': target_full_sha,
        'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    ROLLBACK_FILE.write_text(json.dumps(data), 'utf-8')

def _clear_rollback(owner, repo_name, branch):
    if not ROLLBACK_FILE.exists():
        return
    try:
        data = json.loads(ROLLBACK_FILE.read_text('utf-8'))
        key = f'{owner}/{repo_name}/{branch}'
        data.pop(key, None)
        ROLLBACK_FILE.write_text(json.dumps(data), 'utf-8')
    except Exception:
        pass

# ----------------------- Pull -----------------------
@app.route('/api/pull/clone', methods=['POST'])
def pull_clone():
    data = request.get_json()
    git_url = data.get('gitUrl', '').strip()
    proxy_url = data.get('proxyUrl', '').strip()
    output_dir = data.get('outputDir', '').strip()
    if not git_url or not output_dir:
        return jsonify({'success': False, 'message': 'Git地址和输出目录不能为空'})
    try:
        os.makedirs(output_dir, exist_ok=True)
        dir_name = Path(git_url.rstrip('/').replace('.git', '')).name or 'repo'
        target = os.path.join(output_dir, dir_name)
        if os.path.exists(target):
            shutil.rmtree(target)
        env = os.environ.copy()
        if proxy_url:
            env['http_proxy'] = proxy_url
            env['https_proxy'] = proxy_url
        result = subprocess.run(['git', 'clone', git_url, target], env=env,
                                 capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            return jsonify({'success': True, 'message': '克隆成功',
                             'data': {'outputDir': target, 'output': result.stdout + result.stderr}})
        return jsonify({'success': False, 'message': f'克隆失败：{result.stderr}'})
    except subprocess.TimeoutExpired:
        return jsonify({'success': False, 'message': '克隆超时'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'克隆失败：{e}'})

@app.route('/api/pull/download-zip', methods=['POST'])
def pull_download_zip():
    data = request.get_json()
    git_url = data.get('gitUrl', '').strip()
    proxy_url = data.get('proxyUrl', '').strip()
    output_dir = data.get('outputDir', '').strip()
    if not git_url or not output_dir:
        return jsonify({'success': False, 'message': 'Git地址和输出目录不能为空'})
    try:
        os.makedirs(output_dir, exist_ok=True)
        zip_url = git_url.rstrip('/')
        if zip_url.endswith('.git'):
            zip_url = zip_url[:-4]
        zip_url += '/archive/refs/heads/main.zip'
        proxies = None
        if proxy_url:
            proxies = {'http': proxy_url, 'https': proxy_url}
        r = req.get(zip_url, headers={'User-Agent': 'e-git'}, proxies=proxies, timeout=120)
        if r.status_code != 200:
            zip_url2 = zip_url.replace('/main.zip', '/master.zip')
            r = req.get(zip_url2, headers={'User-Agent': 'e-git'}, proxies=proxies, timeout=120)
            if r.status_code != 200:
                return jsonify({'success': False, 'message': f'下载失败：HTTP {r.status_code}'})
        tmp = tempfile.NamedTemporaryFile(suffix='.zip', delete=False)
        tmp.write(r.content)
        tmp.close()
        for entry in os.scandir(output_dir):
            try:
                if entry.is_dir():
                    shutil.rmtree(entry.path)
                else:
                    os.remove(entry.path)
            except Exception:
                pass
        with zipfile.ZipFile(tmp.name, 'r') as zf:
            zf.extractall(output_dir)
        os.unlink(tmp.name)
        return jsonify({'success': True, 'message': '下载成功', 'data': {'outputDir': output_dir}})
    except Exception as e:
        return jsonify({'success': False, 'message': f'下载失败：{e}'})

# ----------------------- Main -----------------------
@app.after_request
def add_cors(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    return resp

def open_browser():
    webbrowser.open(f'http://localhost:{PORT}')

if __name__ == '__main__':
    print("=" * 40)
    print("    e-git - GitHub 项目管理工具")
    print("=" * 40)
    print(f"  服务已启动：http://localhost:{PORT}")
    print(f"  请在浏览器中打开上述地址")
    print("=" * 40)
    threading.Timer(1.5, open_browser).start()
    app.run(host='0.0.0.0', port=PORT, debug=False)
