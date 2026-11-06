import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = '/Users/gurupreeth/Projects/Nimma Bengaluru';
const skillDir = '/Users/gurupreeth/.codex/plugins/cache/openai-primary-runtime/presentations/26.1104.12130/skills/presentations';
const candidatePath = path.join(workspaceDir, '.presentation-build', 'candidate.pptx');
const finalPath = path.join(workspaceDir, 'output', 'pptx', 'Nimma_Bengaluru_Guide_Presentation.pptx');
const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, 'container_tools', 'artifact_tool_utils.mjs')).href);

const result = await finalizePresentation({
  explicitTotalSlideCount: 10,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: '/Users/gurupreeth/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
  integrityValidatorPath: path.join(skillDir, 'container_tools', 'inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skillDir, 'container_tools', 'inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-bullet-geometry', '--validate-heading-fit'],
  fontPolicy: { basis: 'design', families: ['Arial'] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(workspaceDir, '.presentation-build', 'Nimma_Bengaluru_Guide_Presentation.validation.json'),
});
console.log(JSON.stringify(result));
