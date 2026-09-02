const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

// Lista de archivos y carpetas a ignorar
const IGNORE_LIST = [
  'node_modules',
  '.git',
  '.vercel',
  'package-lock.json',
  '.env',
  '.env.local',
  'storage/pdfs'
];

function shouldIgnore(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  return IGNORE_LIST.some(pattern => normalized.startsWith(pattern) || normalized.includes(`/${pattern}/`));
}

function getAllFiles(dir, baseDir = dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (shouldIgnore(relativePath)) continue;

    if (entry.isDirectory()) {
      files = files.concat(getAllFiles(fullPath, baseDir));
    } else {
      files.push({
        relativePath,
        fullPath
      });
    }
  }

  return files;
}

/**
 * Publica todos los archivos en un repositorio de GitHub usando la API REST
 */
async function publishToGitHub(token, repoName, isPrivate = false) {
  const headers = {
    'Authorization': `token ${token.trim()}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'CobroAuto-Deployer'
  };

  console.log('🔍 Obteniendo datos de usuario autenticado en GitHub...');
  const userRes = await fetch('https://api.github.com/user', { headers });
  if (!userRes.ok) {
    const errText = await userRes.text();
    throw new Error(`Token de GitHub inválido o sin permisos: ${errText}`);
  }
  const userData = await userRes.json();
  const username = userData.login;
  console.log(`👤 Conectado como: ${username}`);

  // 1. Verificar si el repo existe o crearlo
  let repoExists = false;
  const checkRepoRes = await fetch(`https://api.github.com/repos/${username}/${repoName}`, { headers });
  if (checkRepoRes.ok) {
    repoExists = true;
    console.log(`📁 El repositorio "${username}/${repoName}" ya existe en GitHub.`);
  } else {
    console.log(`✨ Creando repositorio "${repoName}" en GitHub...`);
    const createRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: repoName,
        description: 'Sistema Automatizado de Cuentas de Cobro Recurrentes en Node.js',
        private: isPrivate,
        auto_init: true
      })
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Error creando repositorio: ${err}`);
    }
    console.log(`✅ Repositorio creado exitosamente.`);
    await new Promise(r => setTimeout(r, 2000));
  }

  // 2. Si el repo está completamente vacío, inicializarlo con un archivo vía Contents API
  let parentCommitSha = null;
  const branchRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/branches/main`, { headers });
  
  if (!branchRes.ok) {
    console.log('🌱 Inicializando repositorio vacío con README.md...');
    const readmeContent = fs.readFileSync(path.join(ROOT_DIR, 'README.md')).toString('base64');
    const initRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/contents/README.md`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'Initial commit: README',
        content: readmeContent,
        branch: 'main'
      })
    });
    if (!initRes.ok) {
      const err = await initRes.text();
      throw new Error(`Error inicializando repo: ${err}`);
    }
    console.log('✅ Repositorio inicializado con rama main.');
    await new Promise(r => setTimeout(r, 2000));

    // Obtener commit sha
    const newBranchRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/branches/main`, { headers });
    if (newBranchRes.ok) {
      const branchData = await newBranchRes.json();
      parentCommitSha = branchData.commit.sha;
    }
  } else {
    const branchData = await branchRes.json();
    parentCommitSha = branchData.commit.sha;
  }

  // 3. Subir todos los archivos como Blobs
  const files = getAllFiles(ROOT_DIR);
  console.log(`📦 Preparando y subiendo ${files.length} archivos a GitHub...`);

  const treeItems = [];

  for (const file of files) {
    const content = fs.readFileSync(file.fullPath);
    const base64Content = content.toString('base64');

    // Crear blob en GitHub
    const blobRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: base64Content,
        encoding: 'base64'
      })
    });

    if (!blobRes.ok) {
      const err = await blobRes.text();
      console.warn(`⚠️ Error subiendo ${file.relativePath}: ${err}`);
      continue;
    }

    const blobData = await blobRes.json();
    treeItems.push({
      path: file.relativePath,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha
    });
    console.log(`  ✓ Subido: ${file.relativePath}`);
  }

  // 4. Crear nuevo Git Tree
  console.log('🌲 Creando árbol Git...');
  const treePayload = { tree: treeItems };
  if (parentCommitSha) {
    treePayload.base_tree = parentCommitSha;
  }

  const treeRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify(treePayload)
  });

  if (!treeRes.ok) {
    const err = await treeRes.text();
    throw new Error(`Error creando árbol Git: ${err}`);
  }
  const treeData = await treeRes.json();

  // 5. Crear Commit
  console.log('📝 Creando commit con todos los cambios...');
  const commitPayload = {
    message: 'feat: Sistema de Cuentas de Cobro Recurrentes con soporte Vercel',
    tree: treeData.sha
  };
  if (parentCommitSha) {
    commitPayload.parents = [parentCommitSha];
  }

  const commitRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify(commitPayload)
  });

  if (!commitRes.ok) {
    const err = await commitRes.text();
    throw new Error(`Error creando commit: ${err}`);
  }
  const commitData = await commitRes.json();

  // 6. Actualizar referencia refs/heads/main
  console.log('🚀 Publicando en la rama main...');
  const updateRefRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/git/refs/heads/main`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      sha: commitData.sha,
      force: true
    })
  });

  if (!updateRefRes.ok) {
    // Si no existía main, crear la referencia
    await fetch(`https://api.github.com/repos/${username}/${repoName}/git/refs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: 'refs/heads/main',
        sha: commitData.sha
      })
    });
  }

  const repoUrl = `https://github.com/${username}/${repoName}`;
  console.log('====================================================');
  console.log('🎉 ¡PROYECTO SUBIDO A GITHUB EXITOSAMENTE!');
  console.log(`🔗 URL del Repositorio: ${repoUrl}`);
  console.log('====================================================');

  return {
    success: true,
    repoUrl,
    username,
    repoName
  };
}

// Permitir ejecución desde CLI
if (require.main === module) {
  const token = process.argv[2] || process.env.GITHUB_TOKEN;
  const repoName = process.argv[3] || 'automatizacion-ctas-cobro';

  if (!token) {
    console.error('❌ Error: Debes proporcionar un token de GitHub. Uso: node scripts/publish_to_github.js <GITHUB_TOKEN> [NOMBRE_REPO]');
    process.exit(1);
  }

  publishToGitHub(token, repoName)
    .then(res => {
      console.log('Completado:', res);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Error:', err.message);
      process.exit(1);
    });
}

module.exports = { publishToGitHub };
