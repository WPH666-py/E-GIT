var API_BASE = '/api';
var currentPage = 'home';
var selectedFiles = [];
var boundUsername = null;

document.addEventListener('DOMContentLoaded', function () {
    checkAccountStatus();
    bindMenuEvents();
    bindModalEvents();
});

function showToast(msg, type) {
    type = type || 'success';
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 3000);
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    var page = document.getElementById('page-' + pageId);
    if (page) page.classList.add('active');
    currentPage = pageId;
    var backBtn = document.getElementById('backBtn');
    if (pageId === 'home') {
        backBtn.style.display = 'none';
    } else {
        backBtn.style.display = 'inline-block';
    }
}

function bindMenuEvents() {
    document.getElementById('backBtn').addEventListener('click', function () { showPage('home'); });

    document.getElementById('menu-repos').addEventListener('click', function () {
        showPage('repos');
        loadRepositories();
    });
    document.getElementById('menu-upload').addEventListener('click', function () {
        showPage('upload');
    });
    document.getElementById('menu-branches').addEventListener('click', function () {
        showPage('branches');
        var repoName = document.getElementById('branchGraphRepoName').value.trim();
        if (repoName) loadBranchGraph();
    });
    document.getElementById('menu-versions').addEventListener('click', function () {
        showPage('versions');
    });
    document.getElementById('menu-pull').addEventListener('click', function () {
        showPage('pull');
    });
    document.getElementById('menu-settings').addEventListener('click', function () {
        showPage('settings');
    });

    document.getElementById('btnBind').addEventListener('click', onBindClick);

    document.getElementById('btnRefreshRepos').addEventListener('click', loadRepositories);
    document.getElementById('btnCreateRepo').addEventListener('click', function () { showModal('modal-create-repo'); });

    document.getElementById('btnLoadVersions').addEventListener('click', loadVersions);
    document.getElementById('btnRestore').addEventListener('click', submitRestore);

    document.getElementById('btnLoadBranchGraph').addEventListener('click', loadBranchGraph);
    document.getElementById('btnCreateBranchAction').addEventListener('click', function () {
        var repoName = document.getElementById('branchGraphRepoName').value.trim();
        if (repoName) document.getElementById('branchRepoName').value = repoName;
        showModal('modal-branch-create');
    });
    document.getElementById('btnDeleteBranchAction').addEventListener('click', function () {
        var repoName = document.getElementById('branchGraphRepoName').value.trim();
        if (repoName) document.getElementById('branchDelRepoName').value = repoName;
        showModal('modal-branch-delete');
    });
    document.getElementById('btnMergeBranchAction').addEventListener('click', function () {
        var repoName = document.getElementById('branchGraphRepoName').value.trim();
        if (repoName) document.getElementById('mergeRepoName').value = repoName;
        showModal('modal-branch-merge');
    });
}

function bindModalEvents() {
    document.getElementById('closeBindModal').addEventListener('click', function () { hideModal('modal-bind'); });
    document.getElementById('submitBind').addEventListener('click', submitBind);
    document.getElementById('closeRebindModal').addEventListener('click', function () { hideModal('modal-rebind'); });
    document.getElementById('submitRebind').addEventListener('click', submitRebind);

    document.getElementById('closeCreateRepo').addEventListener('click', function () { hideModal('modal-create-repo'); });
    document.getElementById('submitCreateRepo').addEventListener('click', submitCreateRepo);

    document.getElementById('closeDeleteRepo').addEventListener('click', function () { hideModal('modal-delete-repo'); });
    document.getElementById('submitDeleteRepo').addEventListener('click', submitDeleteRepo);

    document.getElementById('closeUploadModal').addEventListener('click', cancelUpload);
    document.getElementById('submitUpload').addEventListener('click', submitUpload);

    document.getElementById('closeBranchCreateModal').addEventListener('click', function () { hideModal('modal-branch-create'); });
    document.getElementById('submitBranchCreate').addEventListener('click', submitBranchCreate);
    document.getElementById('closeBranchDeleteModal').addEventListener('click', function () { hideModal('modal-branch-delete'); });
    document.getElementById('submitBranchDelete').addEventListener('click', submitBranchDelete);
    document.getElementById('closeBranchMergeModal').addEventListener('click', function () { hideModal('modal-branch-merge'); });
    document.getElementById('submitBranchMerge').addEventListener('click', submitBranchMerge);

    document.getElementById('closeCommitDetailModal').addEventListener('click', function () { hideModal('modal-commit-detail'); });

    bindUploadZone();
}

function showModal(id) {
    document.getElementById(id).classList.add('active');
}

function hideModal(id) {
    document.getElementById(id).classList.remove('active');
}

async function checkAccountStatus() {
    try {
        var resp = await fetch(API_BASE + '/account/status');
        var data = await resp.json();
        var btn = document.getElementById('btnBind');
        var info = document.getElementById('accountInfo');
        if (data.success && data.data && data.data.isBound) {
            boundUsername = data.data.username;
            btn.textContent = '换绑账号';
            btn.classList.add('bound');
            info.textContent = '已绑定：' + data.data.username;
        } else {
            btn.textContent = '绑定账号';
            btn.classList.remove('bound');
            info.textContent = '未绑定';
            boundUsername = null;
        }
    } catch (e) {
        showToast('连接服务器失败', 'error');
    }
}

async function onBindClick() {
    if (boundUsername) {
        showModal('modal-rebind');
    } else {
        showModal('modal-bind');
    }
}

async function submitBind() {
    var email = document.getElementById('bindEmail').value.trim();
    var token = document.getElementById('bindToken').value.trim();
    var username = document.getElementById('bindUsername').value.trim();
    if (!email || !token || !username) {
        showToast('请填写完整信息', 'error');
        return;
    }
    try {
        var resp = await fetch(API_BASE + '/account/bind', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, token: token, username: username })
        });
        var data = await resp.json();
        if (data.success) {
            showToast('绑定成功');
            hideModal('modal-bind');
            checkAccountStatus();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('请求失败', 'error');
    }
}

async function submitRebind() {
    var email = document.getElementById('rebindEmail').value.trim();
    var token = document.getElementById('rebindToken').value.trim();
    var username = document.getElementById('rebindUsername').value.trim();
    if (!email || !token || !username) {
        showToast('请填写完整信息', 'error');
        return;
    }
    try {
        var resp = await fetch(API_BASE + '/account/rebind', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, token: token, username: username })
        });
        var data = await resp.json();
        if (data.success) {
            showToast('换绑成功，已使用新账号登录');
            hideModal('modal-rebind');
            checkAccountStatus();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('请求失败', 'error');
    }
}

async function loadRepositories() {
    var list = document.getElementById('repoList');
    list.innerHTML = '<div class="loading">加载中...</div>';
    try {
        var resp = await fetch(API_BASE + '/repos/list');
        var data = await resp.json();
        if (data.success && data.data) {
            var repos = data.data;
            if (repos.length === 0) {
                list.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>暂无仓库</p></div>';
                return;
            }
            var html = '';
            repos.forEach(function (repo) {
                var badge = repo.isPrivate ? '<span class="badge badge-private">私有</span>' : '<span class="badge badge-public">公开</span>';
                html += '<div class="repo-card">';
                html += '<h4>' + escapeHtml(repo.name) + '</h4>';
                html += '<div class="desc">' + escapeHtml(repo.description || '暂无描述') + '</div>';
                html += '<div class="meta">';
                html += badge;
                if (repo.language) html += '<span>' + repo.language + '</span>';
                html += '<span>⭐ ' + repo.stars + '</span>';
                html += '<span>🍴 ' + repo.forks + '</span>';
                html += '<span>默认分支: ' + repo.defaultBranch + '</span>';
                html += '</div>';
                html += '<div class="actions">';
                html += '<button class="btn btn-danger btn-sm" onclick="openDeleteModal(\'' + escapeAttr(repo.name) + '\')">删除</button>';
                html += '</div>';
                html += '</div>';
            });
            list.innerHTML = html;
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        list.innerHTML = '<div class="empty-state"><div class="icon">❌</div><p>加载失败</p></div>';
    }
}

function openDeleteModal(repoName) {
    document.getElementById('deleteRepoName').value = repoName;
    showModal('modal-delete-repo');
}

async function submitCreateRepo() {
    var name = document.getElementById('newRepoName').value.trim();
    var desc = document.getElementById('newRepoDesc').value.trim();
    var isPrivate = document.getElementById('newRepoPrivate').checked;
    if (!name) { showToast('请输入仓库名', 'error'); return; }
    try {
        var resp = await fetch(API_BASE + '/repos/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, description: desc, isPrivate: isPrivate })
        });
        var data = await resp.json();
        if (data.success) {
            showToast('仓库创建成功');
            hideModal('modal-create-repo');
            loadRepositories();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('请求失败', 'error');
    }
}

async function submitDeleteRepo() {
    var repoName = document.getElementById('deleteRepoName').value.trim();
    if (!repoName) { showToast('请输入仓库名', 'error'); return; }
    try {
        var resp = await fetch(API_BASE + '/repos/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoName: repoName })
        });
        var data = await resp.json();
        if (data.success) {
            showToast('仓库已删除');
            hideModal('modal-delete-repo');
            loadRepositories();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('请求失败', 'error');
    }
}

function bindUploadZone() {
    var zone = document.getElementById('uploadZone');
    var fileInput = document.getElementById('fileInput');

    zone.addEventListener('click', function () { fileInput.click(); });

    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('dragover'); });
    zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('dragover');
        var items = e.dataTransfer.items;
        var pending = items.length || 0;
        if (pending === 0) {
            addFileList(e.dataTransfer.files);
            return;
        }
        for (var i = 0; i < items.length; i++) {
            var entry = items[i].webkitGetAsEntry();
            if (entry) {
                traverseEntry(entry, '', function () {
                    pending--;
                    if (pending === 0) renderFileList();
                });
            } else {
                pending--;
                if (pending === 0) renderFileList();
            }
        }
    });
    fileInput.addEventListener('change', function () {
        addFileList(fileInput.files);
        fileInput.value = '';
    });
}

function traverseEntry(entry, parentPath, callback) {
    if (entry.isFile) {
        entry.file(function (file) {
            file._relativePath = parentPath + file.name;
            selectedFiles.push(file);
            callback();
        });
    } else if (entry.isDirectory) {
        var dirReader = entry.createReader();
        var allEntries = [];
        function readBatch() {
            dirReader.readEntries(function (entries) {
                if (entries.length === 0) {
                    var done = 0;
                    if (allEntries.length === 0) { callback(); return; }
                    allEntries.forEach(function (child) {
                        traverseEntry(child, parentPath + entry.name + '/', function () {
                            done++;
                            if (done === allEntries.length) callback();
                        });
                    });
                } else {
                    allEntries = allEntries.concat(Array.prototype.slice.call(entries));
                    readBatch();
                }
            });
        }
        readBatch();
    } else {
        callback();
    }
}

function addFileList(files) {
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        f._relativePath = f._relativePath || f.webkitRelativePath || f.name;
        var dupIdx = -1;
        for (var j = 0; j < selectedFiles.length; j++) {
            if (selectedFiles[j]._relativePath === f._relativePath) {
                dupIdx = j;
                break;
            }
        }
        if (dupIdx >= 0) {
            selectedFiles.splice(dupIdx, 1);
        }
        selectedFiles.push(f);
    }
    renderFileList();
}

function addFiles(files) {
    addFileList(files);
}

function renderFileList() {
    var list = document.getElementById('uploadFileList');
    var html = '';
    selectedFiles.forEach(function (f, idx) {
        var displayName = f._relativePath || f.webkitRelativePath || f.name;
        html += '<div class="file-item">';
        html += '<span>' + escapeHtml(displayName) + ' (' + formatSize(f.size) + ')</span>';
        html += '<span class="remove-file" onclick="removeFile(' + idx + ')">✕</span>';
        html += '</div>';
    });
    list.innerHTML = html;
}

function removeFile(idx) {
    selectedFiles.splice(idx, 1);
    renderFileList();
}

function cancelUpload() {
    hideModal('modal-upload');
    selectedFiles = [];
    renderFileList();
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('progressBarFill').style.width = '0%';
}

async function submitUpload() {
    var repoName = document.getElementById('uploadRepoName').value.trim();
    var branch = document.getElementById('uploadBranch').value.trim() || 'main';
    var commitMsg = document.getElementById('uploadCommitMsg').value.trim() || 'Upload via e-git';

    if (!repoName) { showToast('请输入仓库名', 'error'); return; }
    if (selectedFiles.length === 0) { showToast('请选择文件或文件夹', 'error'); return; }

    var checkResp = await fetch(API_BASE + '/upload/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName: repoName, branch: branch })
    });
    var checkData = await checkResp.json();
    if (!checkData.success) {
        showToast(checkData.message, 'error');
        return;
    }

    var formData = new FormData();
    formData.append('repoName', repoName);
    formData.append('branch', branch);
    formData.append('commitMessage', commitMsg);
    selectedFiles.forEach(function (f) {
        formData.append('files', f, f._relativePath || f.webkitRelativePath || f.name);
    });

    var progressWrap = document.getElementById('uploadProgress');
    var progressBar = document.getElementById('progressBarFill');
    var progressText = document.getElementById('progressText');
    progressWrap.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '0%';

    try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', API_BASE + '/upload/upload-folders');

        xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) {
                var pct = Math.round((e.loaded / e.total) * 100);
                progressBar.style.width = pct + '%';
                progressText.textContent = pct + '%';
            } else {
                progressBar.style.width = '50%';
                progressText.textContent = '上传中...';
            }
        };

        xhr.onload = function () {
            progressBar.style.width = '100%';
            progressText.textContent = '✓ 上传成功';
            progressText.style.color = '#2da44e';
            setTimeout(function () {
                var data = JSON.parse(xhr.responseText);
                if (data.success) {
                    showToast('🎉 上传成功！');
                    cancelUpload();
                    hideModal('modal-upload');
                    progressText.style.color = '#24292e';
                } else {
                    showToast(data.message, 'error');
                    progressWrap.style.display = 'none';
                }
            }, 800);
        };

        xhr.onerror = function () {
            showToast('上传失败，请检查网络', 'error');
            progressWrap.style.display = 'none';
        };

        xhr.send(formData);
    } catch (e) {
        showToast('上传失败', 'error');
        progressWrap.style.display = 'none';
    }
}

function openUploadModal() {
    if (!boundUsername) { showToast('请先绑定账号', 'error'); return; }
    selectedFiles = [];
    renderFileList();
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('progressBarFill').style.width = '0%';
    showModal('modal-upload');
}

async function submitBranchCreate() {
    var repoName = document.getElementById('branchRepoName').value.trim();
    var branchName = document.getElementById('newBranchName').value.trim();
    var sourceBranch = document.getElementById('branchSource').value.trim() || 'main';
    if (!repoName || !branchName) { showToast('请填写完整信息', 'error'); return; }
    try {
        var resp = await fetch(API_BASE + '/branches/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoName: repoName, branchName: branchName, sourceBranch: sourceBranch })
        });
        var data = await resp.json();
        if (data.success) {
            showToast('分支创建成功');
            hideModal('modal-branch-create');
            loadBranchGraph();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('请求失败', 'error');
    }
}

async function submitBranchDelete() {
    var repoName = document.getElementById('branchDelRepoName').value.trim();
    var branchName = document.getElementById('branchDelName').value.trim();
    if (!repoName || !branchName) { showToast('请填写完整信息', 'error'); return; }
    try {
        var resp = await fetch(API_BASE + '/branches/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoName: repoName, branchName: branchName })
        });
        var data = await resp.json();
        if (data.success) {
            showToast('分支删除成功');
            hideModal('modal-branch-delete');
            loadBranchGraph();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('请求失败', 'error');
    }
}

async function submitBranchMerge() {
    var repoName = document.getElementById('mergeRepoName').value.trim();
    var baseBranch = document.getElementById('mergeBaseBranch').value.trim();
    var headBranch = document.getElementById('mergeHeadBranch').value.trim();
    if (!repoName || !baseBranch || !headBranch) { showToast('请填写完整信息', 'error'); return; }
    try {
        var resp = await fetch(API_BASE + '/branches/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoName: repoName, baseBranch: baseBranch, headBranch: headBranch })
        });
        var data = await resp.json();
        if (data.success) {
            showToast('分支合并成功');
            hideModal('modal-branch-merge');
            loadBranchGraph();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('请求失败', 'error');
    }
}

function getBranchColors() {
    return ['#0969da', '#cf222e', '#1a7f37', '#9a6700', '#8250df', '#bf3989', '#0550ae', '#bc4c00'];
}

var branchColorMap = {};

function getBranchColor(branchName) {
    if (!branchColorMap[branchName]) {
        var colors = getBranchColors();
        var idx = Object.keys(branchColorMap).length % colors.length;
        branchColorMap[branchName] = colors[idx];
    }
    return branchColorMap[branchName];
}

async function loadBranchGraph() {
    if (!boundUsername) { showToast('请先绑定账号', 'error'); return; }
    var repoName = document.getElementById('branchGraphRepoName').value.trim();
    if (!repoName) { showToast('请输入仓库名', 'error'); return; }
    var container = document.getElementById('branchGraphContainer');
    container.innerHTML = '<div class="loading">加载分支图谱中...</div>';
    branchColorMap = {};
    try {
        var resp = await fetch(API_BASE + '/branches/graph?repoName=' + encodeURIComponent(repoName));
        var data = await resp.json();
        if (data.success && data.data) {
            renderBranchGraph(container, data.data, repoName);
        } else {
            container.innerHTML = '<div class="empty-state"><div class="icon">❌</div><p>' + escapeHtml(data.message) + '</p></div>';
        }
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><div class="icon">❌</div><p>加载失败</p></div>';
    }
}

function renderBranchGraph(container, graphData, repoName) {
    var branches = graphData.branches || [];
    var nodes = graphData.nodes || [];
    var laneCount = graphData.laneCount || branches.length;
    var headSha = graphData.headSha || '';
    if (branches.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">🌿</div><p>暂无分支</p></div>';
        return;
    }

    var legendHtml = '<div class="branch-graph-legend">';
    branches.forEach(function (b) {
        var color = getBranchColor(b.name);
        var label = b.isDefault ? b.name + ' <span style="font-size:10px;background:#0969da;color:#fff;padding:1px 5px;border-radius:3px;">默认</span>' : b.name;
        legendHtml += '<div class="branch-legend-item"><span class="branch-legend-dot" style="background:' + color + ';"></span><span>' + label + '</span></div>';
    });
    legendHtml += '</div>';

    var laneW = 22;
    var rowH = 46;
    var leftPad = laneCount * laneW + 8;
    var totalW = laneCount * laneW;
    var totalH = nodes.length * rowH + 10;

    var svg = '<svg class="git-graph-svg" width="100%" height="' + totalH + '" style="min-width:800px;">';

    var nodeYMap = {};
    nodes.forEach(function (n, idx) {
        nodeYMap[n.fullSha] = idx * rowH + rowH / 2 + 5;
    });

    var branchNodeIndices = {};
    branches.forEach(function (b) {
        branchNodeIndices[b.name] = [];
    });
    nodes.forEach(function (n, idx) {
        if (branchNodeIndices[n.branch]) {
            branchNodeIndices[n.branch].push(idx);
        }
    });

    branches.forEach(function (b) {
        var indices = branchNodeIndices[b.name] || [];
        var color = getBranchColor(b.name);
        var lx = b.lane * laneW + laneW / 2;
        for (var k = 0; k < indices.length - 1; k++) {
            var yi = indices[k] * rowH + rowH / 2 + 5;
            var yj = indices[k + 1] * rowH + rowH / 2 + 5;
            svg += '<line x1="' + lx + '" y1="' + yi + '" x2="' + lx + '" y2="' + yj + '" stroke="' + color + '" stroke-width="2" opacity="0.6"/>';
        }
    });

    nodes.forEach(function (n) {
        var y = nodeYMap[n.fullSha];
        var x = n.lane * laneW + laneW / 2;
        var color = getBranchColor(n.branch);
        (n.connections || []).forEach(function (conn) {
            var py = nodeYMap[conn.parentFullSha];
            if (py !== undefined) {
                var px = conn.lane * laneW + laneW / 2;
                var midY = (y + py) / 2;
                var path = 'M' + x + ',' + y + ' C' + x + ',' + midY + ' ' + px + ',' + midY + ' ' + px + ',' + py;
                svg += '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="1.5" opacity="0.55" stroke-dasharray="4,3"/>';
            }
        });
    });

    nodes.forEach(function (n, idx) {
        var y = idx * rowH + rowH / 2 + 5;
        var x = n.lane * laneW + laneW / 2;
        var color = getBranchColor(n.branch);
        svg += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="' + color + '" stroke="#fff" stroke-width="2" style="cursor:pointer;" onclick="showCommitDetail(\'' + escapeAttr(repoName) + '\',\'' + escapeAttr(n.fullSha) + '\')"/>';
        if (n.fullSha === headSha) {
            var tx = x + 9;
            svg += '<polygon points="' + tx + ',' + (y - 7) + ' ' + (tx + 12) + ',' + y + ' ' + tx + ',' + (y + 7) + '" fill="#cf222e" stroke="#fff" stroke-width="1"/>';
        }
    });

    nodes.forEach(function (n) {
        var y = nodeYMap[n.fullSha];
        var color = getBranchColor(n.branch);
        var x = n.lane * laneW + laneW / 2;
        svg += '<line x1="' + x + '" y1="' + y + '" x2="' + leftPad + '" y2="' + y + '" stroke="' + color + '" stroke-width="1" opacity="0.25"/>';
    });

    nodes.forEach(function (n, idx) {
        var y = idx * rowH + rowH / 2 + 5;
        svg += '<text x="' + (leftPad + 6) + '" y="' + (y - 6) + '" font-size="12" font-weight="600" fill="#24292e" style="cursor:pointer;" onclick="showCommitDetail(\'' + escapeAttr(repoName) + '\',\'' + escapeAttr(n.fullSha) + '\')">' + escapeHtml(n.message) + '</text>';
        svg += '<text x="' + (leftPad + 6) + '" y="' + (y + 10) + '" font-size="10" fill="#6a737d">' + escapeHtml(n.sha) + ' | ' + escapeHtml(n.author) + ' | ' + escapeHtml(n.date.split('T')[0]) + '</text>';
    });

    svg += '</svg>';

    container.innerHTML = legendHtml + svg;
}

async function showCommitDetail(repoName, sha) {
    var modal = document.getElementById('modal-commit-detail');
    var content = document.getElementById('commitDetailContent');
    content.innerHTML = '<div class="loading">加载中...</div>';
    showModal('modal-commit-detail');
    try {
        var resp = await fetch(API_BASE + '/branches/commit-detail?repoName=' + encodeURIComponent(repoName) + '&sha=' + encodeURIComponent(sha));
        var data = await resp.json();
        if (data.success && data.data) {
            var d = data.data;
            var author = d.author || {};
            var stats = d.stats || {};

            var html = '';

            html += '<div class="commit-detail-section">';
            html += '<h4>提交信息</h4>';
            html += '<div class="commit-detail-meta">';
            html += '<dt>SHA</dt><dd>' + escapeHtml(d.fullSha || sha) + '</dd>';
            html += '<dt>提交者</dt><dd>' + escapeHtml(author.login || author.name || '') + '</dd>';
            html += '<dt>邮箱</dt><dd>' + escapeHtml(author.email || '') + '</dd>';
            html += '<dt>国家/地区</dt><dd>' + escapeHtml(author.location || '未知') + '</dd>';
            html += '<dt>提交时间</dt><dd>' + escapeHtml(d.date || '') + '</dd>';
            html += '<dt>变更统计</dt><dd>+<span class="add">' + (stats.additions || 0) + '</span> / -<span class="del">' + (stats.deletions || 0) + '</span></dd>';
            html += '</div>';
            html += '</div>';

            html += '<div class="commit-detail-section">';
            html += '<h4>提交说明</h4>';
            html += '<pre style="font-size:13px;white-space:pre-wrap;color:#24292e;background:#f6f8fa;padding:12px;border-radius:6px;">' + escapeHtml(d.message || '') + '</pre>';
            html += '</div>';

            var files = d.files || [];
            html += '<div class="commit-detail-section">';
            html += '<h4>变更文件 (' + files.length + ')</h4>';
            html += '<div class="commit-detail-files">';

            files.forEach(function (f, fi) {
                var tagClass = f.status === 'added' ? 'added' : f.status === 'removed' ? 'removed' : 'modified';
                var tagText = f.status === 'added' ? '新增' : f.status === 'removed' ? '删除' : '修改';
                html += '<div class="commit-file-item">';
                html += '<div class="commit-file-header" onclick="var d=document.getElementById(\'diff-' + fi + '\');d.style.display=d.style.display===\'none\'?\'block\':\'none\';">';
                html += '<span class="commit-file-name">' + escapeHtml(f.filename) + '</span>';
                html += '<span style="display:flex;align-items:center;gap:8px;">';
                html += '<span class="commit-file-tag ' + tagClass + '">' + tagText + '</span>';
                html += '<span class="commit-file-stats"><span class="add">+' + f.additions + '</span> / <span class="del">-' + f.deletions + '</span></span>';
                html += '</span>';
                html += '</div>';
                if (f.patch) {
                    html += '<div class="commit-file-diff" id="diff-' + fi + '" style="display:block;">' + colorizeDiff(f.patch) + '</div>';
                }
                html += '</div>';
            });

            html += '</div></div>';
            content.innerHTML = html;
        } else {
            content.innerHTML = '<div class="empty-state"><p>' + escapeHtml(data.message) + '</p></div>';
        }
    } catch (e) {
        content.innerHTML = '<div class="empty-state"><div class="icon">❌</div><p>加载失败</p></div>';
    }
}

function colorizeDiff(patch) {
    var lines = patch.split('\n');
    var html = '';
    lines.forEach(function (line) {
        var escaped = escapeHtml(line);
        if (line.indexOf('@@') === 0) {
            html += '<span class="diff-hunk-header">' + escaped + '</span>\n';
        } else if (line.indexOf('+') === 0) {
            html += '<span class="diff-add">' + escaped + '</span>\n';
        } else if (line.indexOf('-') === 0) {
            html += '<span class="diff-del">' + escaped + '</span>\n';
        } else {
            html += '<span class="diff-normal">' + escaped + '</span>\n';
        }
    });
    return html;
}

var versionBranch = '';

async function loadVersions() {
    if (!boundUsername) { showToast('请先绑定账号', 'error'); return; }
    var repoName = document.getElementById('versionRepoName').value.trim();
    if (!repoName) { showToast('请输入仓库名', 'error'); return; }
    var list = document.getElementById('versionList');
    var btnS = document.getElementById('btnRestore');
    var btnR = document.getElementById('btnRollback');
    var infoBar = document.getElementById('rollbackInfoBar');
    list.innerHTML = '<div class="loading">加载中...</div>';
    btnS.style.display = 'none';
    btnR.style.display = 'none';
    infoBar.style.display = 'none';
    versionBranch = '';
    try {
        var resp = await fetch(API_BASE + '/version/commits?repoName=' + encodeURIComponent(repoName) + '&perPage=30');
        var data = await resp.json();
        if (data.success && data.data) {
            var commits = data.data;
            versionBranch = data.branch || 'main';
            if (commits.length === 0) {
                list.innerHTML = '<div class="empty-state"><p>暂无提交记录</p></div>';
            } else {
                var html = '';
                commits.forEach(function (c, idx) {
                    var isRollbackTarget = data.rollbackTarget && c.fullSha === data.rollbackTarget.targetFullSha;
                    var isOriginalPos = data.rollbackTarget && c.fullSha === data.rollbackTarget.originalFullSha;
                    var marker = '';
                    if (isRollbackTarget) marker = ' <span style="font-size:10px;background:#9a6700;color:#fff;padding:1px 5px;border-radius:3px;">已回滚到此</span>';
                    if (isOriginalPos) marker = ' <span style="font-size:10px;background:#cf222e;color:#fff;padding:1px 5px;border-radius:3px;">回滚前位置</span>';
                    var parentsStr = c.parents.length > 0 ? c.parents.join(', ') : '无父提交';
                    html += '<div class="version-item">';
                    html += '<div class="message">' + escapeHtml(c.message.split('\n')[0]) + marker + '</div>';
                    html += '<div class="info">' + escapeHtml(c.sha) + ' | ' + escapeHtml(c.author) + ' | ' + escapeHtml(c.date) + ' | 父提交: ' + escapeHtml(parentsStr) + '</div>';
                    html += '</div>';
                });
                list.innerHTML = html;
                var firstCommit = commits[0];
                if (firstCommit.parentFullShas && firstCommit.parentFullShas.length > 0 && !data.canRestore) {
                    btnR.style.display = 'inline-block';
                    btnR.disabled = false;
                    btnR.onclick = function () {
                        prepareRollback(firstCommit.fullSha, firstCommit.parentFullShas[0], firstCommit.sha);
                    };
                }
            }
            if (data.canRestore) {
                btnS.style.display = 'inline-block';
                btnS.disabled = false;
                var rb = data.rollbackTarget;
                infoBar.style.display = 'block';
                infoBar.innerHTML = '⏪ 已回滚到 <b>' + escapeHtml(rb.targetSha) + '</b>（时间: ' + escapeHtml(rb.time) + '），点击"还原"恢复到 <b>' + escapeHtml(rb.originalSha) + '</b>';
            }
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

function prepareRollback(currentFullSha, parentFullSha, currentShortSha) {
    if (!confirm('确认将分支 ' + versionBranch + ' 回滚？\n\n回滚后 HEAD 将从 ' + currentShortSha + ' 移动到其父提交。\n回滚后可通过"还原"按钮恢复。')) return;
    doRollback(currentFullSha, parentFullSha);
}

async function doRollback(currentFullSha, targetFullSha) {
    var repoName = document.getElementById('versionRepoName').value.trim();
    try {
        var resp = await fetch(API_BASE + '/version/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoName: repoName, targetSha: targetFullSha, branch: versionBranch })
        });
        var data = await resp.json();
        if (data.success) {
            showToast('回滚成功');
            loadVersions();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('请求失败', 'error');
    }
}

async function submitRestore() {
    var repoName = document.getElementById('versionRepoName').value.trim();
    if (!versionBranch) { showToast('请先查询版本', 'error'); return; }
    if (!confirm('确认还原？\n\n这将撤销之前的回滚操作，恢复到回滚前的状态。')) return;
    var btnS = document.getElementById('btnRestore');
    btnS.disabled = true;
    btnS.textContent = '还原中...';
    try {
        var resp = await fetch(API_BASE + '/version/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoName: repoName, branch: versionBranch })
        });
        var data = await resp.json();
        if (data.success) {
            showToast('还原成功');
            loadVersions();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('请求失败', 'error');
    }
    btnS.disabled = false;
    btnS.textContent = '还原';
}

function getPullFormData() {
    return {
        gitUrl: document.getElementById('pullGitUrlPage').value.trim(),
        proxyUrl: document.getElementById('pullProxyPage').value.trim(),
        outputDir: document.getElementById('pullOutputDirPage').value.trim()
    };
}

async function submitClonePage() {
    var d = getPullFormData();
    if (!d.gitUrl || !d.outputDir) { showToast('请填写完整信息', 'error'); return; }
    try {
        var resp = await fetch(API_BASE + '/pull/clone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(d)
        });
        var data = await resp.json();
        if (data.success) {
            showToast('下拉成功: ' + (data.data && data.data.outputDir));
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('请求失败', 'error');
    }
}

async function submitDownloadZipPage() {
    var d = getPullFormData();
    if (!d.gitUrl || !d.outputDir) { showToast('请填写完整信息', 'error'); return; }
    try {
        var resp = await fetch(API_BASE + '/pull/download-zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(d)
        });
        var data = await resp.json();
        if (data.success) {
            showToast('下载成功: ' + (data.data && data.data.outputDir));
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('请求失败', 'error');
    }
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
