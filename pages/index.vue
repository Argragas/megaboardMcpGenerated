<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import draggable from 'vuedraggable';

const { getProjects, getProjectIssues, updateIssueLabels, getProjectBoardLists } = useGitLabApi();

const projects = ref([]);
const issues = ref([]);
const isLoading = ref(true);
const selectedProjects = ref([]);
const allLabels = ref([]);
const selectedLabels = ref([]);

const boardColumns = ref([]);
const boardData = ref({});

const defaultProjectColors = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399',
  '#2dd4bf', '#22d3ee', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa',
  '#c084fc', '#e879f9', '#f472b6', '#fb7185'
];
const projectColors = ref([]);
const projectColorMap = ref({});

// --- Configuration State ---
const gitlabUrl = ref('');
const gitlabToken = ref('');
const refreshIntervalMinutes = ref(5);
const issueTitleFontSize = ref(14); // Default font size

// --- Configuration Functions ---
const saveConfig = () => {
  if (gitlabUrl.value && gitlabToken.value) {
    localStorage.setItem('gitlab-url', gitlabUrl.value);
    localStorage.setItem('gitlab-token', gitlabToken.value);
    localStorage.setItem('project-colors', JSON.stringify(projectColors.value));
    localStorage.setItem('refresh-interval', refreshIntervalMinutes.value * 60000);
    localStorage.setItem('issue-title-font-size', issueTitleFontSize.value);

    // Update the live values in the app
    refreshInterval.value = refreshIntervalMinutes.value * 60000;

    alert('Configuration saved!');
    showConfigModal.value = false;
    fetchData(); // Re-fetch data with new config
  } else {
    alert('Please fill in all required fields.');
  }
};

const addColor = () => {
  projectColors.value.push('#000000');
};

const removeColor = (index) => {
  projectColors.value.splice(index, 1);
};

const resetColors = () => {
  projectColors.value = [...defaultProjectColors];
  localStorage.setItem('project-colors', JSON.stringify(projectColors.value));
};


const assignProjectColors = () => {
  const newColorMap = {};
  projects.value.forEach((project, index) => {
    if (projectColors.value.length > 0) {
      newColorMap[project.id] = projectColors.value[index % projectColors.value.length];
    }
  });
  projectColorMap.value = newColorMap;
};

const getProjectColor = (projectId) => {
  return projectColorMap.value[projectId] || '#cccccc'; // A default fallback color
};

const updateBoardData = () => {
  const newBoardData = {};
  boardColumns.value.forEach(column => {
    newBoardData[column.label.name] = [];
  });

  const filteredIssues = issues.value.filter(issue => {
    const projectMatch = selectedProjects.value.length === 0 || selectedProjects.value.includes(issue.project_id);
    if (!projectMatch) return false;

    if (selectedLabels.value.length === 0) return true;

    return issue.labels.some(label => selectedLabels.value.includes(label.name));
  });

  const columnNames = boardColumns.value.map(c => c.label.name);

  filteredIssues.forEach(issue => {
    let placed = false;
    if (issue.labels) {
      for (const label of issue.labels) {
        if (columnNames.includes(label.name)) {
          newBoardData[label.name].push(issue);
          placed = true;
          break;
        }
      }
    }
    if (!placed && boardColumns.value.length > 0) {
      const firstColumnName = boardColumns.value[0].label.name;
      if(newBoardData[firstColumnName]) {
        newBoardData[firstColumnName].push(issue);
      }
    }
  });

  boardData.value = newBoardData;
};

const refreshInterval = ref(300000);
let refreshTimer = null;

const fetchData = async (isManualRefresh = false) => {
  if (!isManualRefresh) {
    isLoading.value = true;
  }
  try {
    const fetchedProjects = await getProjects();
    projects.value = fetchedProjects;
    assignProjectColors();

    if (fetchedProjects.length > 0) {
      const listPromises = fetchedProjects.map(p => getProjectBoardLists(p.id));
      const results = await Promise.all(listPromises);
      const allLists = results.flat();

      if (allLists.length > 0) {
        const uniqueColumnsMap = new Map();
        allLists.forEach(list => {
          if (list.label && !uniqueColumnsMap.has(list.label.name)) {
            uniqueColumnsMap.set(list.label.name, list);
          }
        });

        const uniqueColumns = Array.from(uniqueColumnsMap.values());

        const customOrderStr = localStorage.getItem('column-order') || '';
        const customOrder = customOrderStr.split(',').map(s => s.trim()).filter(s => s);

        if (customOrder.length > 0) {
            uniqueColumns.sort((a, b) => {
                const nameA = a.label.name;
                const nameB = b.label.name;

                const indexA = customOrder.indexOf(nameA);
                const indexB = customOrder.indexOf(nameB);

                if (indexA !== -1 && indexB !== -1) {
                    return indexA - indexB;
                }
                if (indexA !== -1) {
                    return -1;
                }
                if (indexB !== -1) {
                    return 1;
                }
                return nameA.localeCompare(nameB);
            });
        } else {
            // Default to alphabetical sort if no custom order is set
            uniqueColumns.sort((a, b) => a.label.name.localeCompare(b.label.name));
        }

        boardColumns.value = uniqueColumns;
      } else {
        // Fallback to default columns if no lists are found
        console.warn("No board lists found for any project. Falling back to default columns.");
        boardColumns.value = [
          { label: { name: 'To Do', color: '#428BCA' }, position: 1 },
          { label: { name: 'Doing', color: '#F0AD4E' }, position: 2 },
          { label: { name: 'Done', color: '#5CB85C' }, position: 3 },
        ];
      }
    }

    const issuePromises = fetchedProjects.map(async (project) => {
      const projectIssues = await getProjectIssues(project.id);
      return projectIssues.map(issue => ({
        ...issue,
        project_name: project.name,
      }));
    });

    const results = await Promise.all(issuePromises);
    const allIssues = results.flat();
    issues.value = allIssues;

    const uniqueLabels = {};
    allIssues.forEach(issue => {
      if (issue.labels) {
        issue.labels.forEach(label => {
          if (!uniqueLabels[label.name]) {
            uniqueLabels[label.name] = label;
          }
        });
      }
    });
    allLabels.value = Object.values(uniqueLabels).sort((a, b) => a.name.localeCompare(b.name));

    updateBoardData();
  } catch (error) {
    console.error('Failed to fetch data from GitLab:', error);
  } finally {
    if (!isManualRefresh) {
      isLoading.value = false;
    }
  }
};

const setupAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  if (refreshInterval.value > 0) {
    refreshTimer = setInterval(() => fetchData(true), refreshInterval.value);
  }
};

const manualRefresh = () => {
  fetchData(true);
  setupAutoRefresh();
};

onMounted(() => {
  // Load config from localStorage
  gitlabUrl.value = localStorage.getItem('gitlab-url') || '';
  gitlabToken.value = localStorage.getItem('gitlab-token') || '';
  const savedColors = localStorage.getItem('project-colors');
  if (savedColors) {
    projectColors.value = JSON.parse(savedColors);
  } else {
    projectColors.value = [...defaultProjectColors];
  }
  const savedInterval = localStorage.getItem('refresh-interval');
  if (savedInterval) {
    refreshIntervalMinutes.value = parseInt(savedInterval, 10) / 60000;
    refreshInterval.value = parseInt(savedInterval, 10);
  }
  const savedFontSize = localStorage.getItem('issue-title-font-size');
  if (savedFontSize) {
    issueTitleFontSize.value = parseInt(savedFontSize, 10);
  }

  // If config is missing, open the modal
  if (!gitlabUrl.value || !gitlabToken.value) {
    showConfigModal.value = true;
  } else {
    // Fetch data only if config is present
    fetchData();
    setupAutoRefresh();
  }

  window.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  window.removeEventListener('click', handleClickOutside);
});

watch([selectedProjects, selectedLabels], updateBoardData, { deep: true });

const showProjectFilter = ref(false);
const showLabelFilter = ref(false);
const showConfigModal = ref(false);
const projectFilterRef = ref(null);
const labelFilterRef = ref(null);

const toggleProjectFilter = () => {
  showProjectFilter.value = !showProjectFilter.value;
  if (showProjectFilter.value) {
    showLabelFilter.value = false;
  }
};

const openConfigModal = () => {
  showConfigModal.value = true;
};

const toggleLabelFilter = () => {
  showLabelFilter.value = !showLabelFilter.value;
  if (showLabelFilter.value) {
    showProjectFilter.value = false;
  }
};

const handleClickOutside = (event) => {
  if (projectFilterRef.value && !projectFilterRef.value.contains(event.target)) {
    showProjectFilter.value = false;
  }
  if (labelFilterRef.value && !labelFilterRef.value.contains(event.target)) {
    showLabelFilter.value = false;
  }
};

const toggleProjectSelection = (projectId) => {
  const index = selectedProjects.value.indexOf(projectId);
  if (index > -1) {
    selectedProjects.value.splice(index, 1);
  } else {
    selectedProjects.value.push(projectId);
  }
};

const isProjectSelected = (projectId) => {
  return selectedProjects.value.includes(projectId);
};

const clearProjectFilter = () => {
  selectedProjects.value = [];
};

const toggleLabelSelection = (labelName) => {
  const index = selectedLabels.value.indexOf(labelName);
  if (index > -1) {
    selectedLabels.value.splice(index, 1);
  } else {
    selectedLabels.value.push(labelName);
  }
};

const isLabelSelected = (labelName) => {
  return selectedLabels.value.includes(labelName);
};

const clearLabelFilter = () => {
  selectedLabels.value = [];
};

const getLabelButtonStyle = (label) => {
  const selected = isLabelSelected(label.name);
  if (selected) {
    return {
      backgroundColor: label.color,
      color: getTextColor(label.color),
      borderColor: label.color,
    };
  } else {
    return {
      backgroundColor: 'transparent',
      color: label.color,
      borderColor: label.color,
    };
  }
};

const getTextColor = (backgroundColor) => {
  if (!backgroundColor) return '#000000';
  const color = backgroundColor.charAt(0) === '#' ? backgroundColor.substring(1, 7) : backgroundColor;
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const uicolors = [r / 255, g / 255, b / 255];
  const c = uicolors.map((col) => {
    if (col <= 0.03928) {
      return col / 12.92;
    }
    return Math.pow((col + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (L > 0.179) ? '#000000' : '#FFFFFF';
};

const onColumnDragEnd = () => {
  const newOrder = boardColumns.value.map(column => column.label.name);
  localStorage.setItem('column-order', newOrder.join(','));
};

const onDragEnd = async (event) => {
  const { to, item } = event;
  const newColumnElement = to.closest('.board-column');
  const newColumnName = newColumnElement.dataset.columnName;
  const newLabel = newColumnName;

  if (!newLabel) {
    console.error('Could not determine new label for the column.');
    return;
  }

  const issueId = item.dataset.issueId;
  const issue = issues.value.find(i => i.id == issueId);

  if (!issue) {
    console.error('Could not find the issue that was moved.');
    return;
  }

  if (issue.labels.some(l => l.name === newLabel)) {
    return;
  }

  const columnLabels = boardColumns.value.map(c => c.label.name);
  const otherLabels = issue.labels.map(l => l.name).filter(label => !columnLabels.includes(label));
  const newLabels = [...otherLabels, newLabel];

  try {
    await updateIssueLabels(issue.project_id, issue.iid, newLabels);
    const oldColumnLabels = columnLabels;
    issue.labels = issue.labels.filter(l => !oldColumnLabels.includes(l.name));
    const newLabelColor = boardColumns.value.find(c => c.label.name === newLabel)?.label.color || '#000000';
    issue.labels.push({ name: newLabel, color: newLabelColor });
  } catch (error) {
    console.error('Failed to update issue labels on GitLab:', error);
    updateBoardData();
  }
};
</script>

<template>
  <div>
    <div v-if="isLoading" class="loading-container">
      <svg width="120" height="120" viewBox="0 0 1000 963.197" class="gitlab-logo-animation">
        <g transform="matrix(5.2068817,0,0,5.2068817,-489.30756,-507.76085)">
          <path fill="#e24329" d="m 282.83,170.73 -0.27,-0.69 -26.14,-68.22 a 6.81,6.81 0 0 0 -2.69,-3.24 7,7 0 0 0 -8,0.43 7,7 0 0 0 -2.32,3.52 l -17.65,54 h -71.47 l -17.65,-54 a 6.86,6.86 0 0 0 -2.32,-3.53 7,7 0 0 0 -8,-0.43 6.87,6.87 0 0 0 -2.69,3.24 L 97.44,170 l -0.26,0.69 a 48.54,48.54 0 0 0 16.1,56.1 l 0.09,0.07 0.24,0.17 39.82,29.82 19.7,14.91 12,9.06 a 8.07,8.07 0 0 0 9.76,0 l 12,-9.06 19.7,-14.91 40.06,-30 0.1,-0.08 a 48.56,48.56 0 0 0 16.08,-56.04 z" />
          <path fill="#fc6d26" d="m 282.83,170.73 -0.27,-0.69 a 88.3,88.3 0 0 0 -35.15,15.8 L 190,229.25 c 19.55,14.79 36.57,27.64 36.57,27.64 l 40.06,-30 0.1,-0.08 a 48.56,48.56 0 0 0 16.1,-56.08 z" />
          <path fill="#fca326" d="m 153.43,256.89 19.7,14.91 12,9.06 a 8.07,8.07 0 0 0 9.76,0 l 12,-9.06 19.7,-14.91 c 0,0 -17.04,-12.89 -36.59,-27.64 -19.55,14.75 -36.57,27.64 -36.57,27.64 z" />
          <path fill="#fc6d26" d="M 132.58,185.84 A 88.19,88.19 0 0 0 97.44,170 l -0.26,0.69 a 48.54,48.54 0 0 0 16.1,56.1 l 0.09,0.07 0.24,0.17 39.82,29.82 c 0,0 17,-12.85 36.57,-27.64 z" />
        </g>
      </svg>
      <div class="loading-subtext">Loading MegaBoard...</div>
    </div>
    <div v-else>
      <!-- Filter Section -->
      <div class="p-4 mb-4 flex items-center">
        <div class="flex gap-2">
          <!-- Project Filter Dropdown -->
          <div class="relative" ref="projectFilterRef">
            <button @click="toggleProjectFilter" class="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
              Projects <span v-if="selectedProjects.length > 0" class="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">{{ selectedProjects.length }}</span>
            </button>
            <div v-if="showProjectFilter" class="absolute z-10 mt-2 w-72 origin-top-left bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 p-4">
              <div class="flex justify-between items-center mb-3">
                <h3 class="font-semibold text-gray-800">Filter by Project</h3>
                <button @click="clearProjectFilter" v-if="selectedProjects.length > 0" class="text-sm text-blue-600 hover:underline">Clear</button>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="project in projects"
                  :key="project.id"
                  @click="toggleProjectSelection(project.id)"
                  :class="['px-3 py-1 rounded-full text-sm font-medium border', isProjectSelected(project.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-100']"
                >
                  {{ project.name }}
                </button>
              </div>
            </div>
          </div>
          <!-- Label Filter Dropdown -->
          <div class="relative" ref="labelFilterRef">
            <button @click="toggleLabelFilter" class="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
              Labels <span v-if="selectedLabels.length > 0" class="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">{{ selectedLabels.length }}</span>
            </button>
            <div v-if="showLabelFilter" class="absolute z-10 mt-2 w-96 origin-top-left bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 p-4">
              <div class="flex justify-between items-center mb-3">
                <h3 class="font-semibold text-gray-800">Filter by Label</h3>
                <button @click="clearLabelFilter" v-if="selectedLabels.length > 0" class="text-sm text-blue-600 hover:underline">Clear</button>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="label in allLabels"
                  :key="label.id"
                  @click="toggleLabelSelection(label.name)"
                  class="px-3 py-1 rounded-full text-sm font-medium border-2 transition-colors"
                  :style="getLabelButtonStyle(label)"
                >
                  {{ label.name }}
                </button>
              </div>
            </div>
          </div>
          <button @click="manualRefresh" class="p-2 rounded-md hover:bg-gray-100 transition-colors border border-gray-300 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.667 0l3.181-3.183m-4.991-11.666a8.25 8.25 0 00-11.667 0l-3.181 3.183" />
            </svg>
          </button>
          <button @click="openConfigModal" class="p-2 rounded-md hover:bg-gray-100 transition-colors border border-gray-300 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-1.003 1.11-1.226l.043-.023c.295-.12.618-.18.947-.18s.652.06.947.18l.043.023c.549.223 1.02.684 1.11 1.226l.03.162c.043.26.064.525.064.792s-.02.532-.064.792l-.03.162c-.09.542-.56 1.004-1.11 1.226l-.043.023c-.295.12-.618.18-.947-.18s-.652-.06-.947-.18l-.043-.023c-.549-.223-1.02-.684-1.11-1.226l-.03-.162a4.506 4.506 0 01-.064-.792s.02-.532.064-.792l.03-.162zM9.594 18.94c.09-.542.56-1.003 1.11-1.226l.043-.023c.295-.12.618-.18.947-.18s.652.06.947.18l.043.023c.549.223 1.02.684 1.11 1.226l.03.162c.043.26.064.525.064.792s-.02.532-.064.792l-.03.162c-.09.542-.56 1.004-1.11 1.226l-.043.023c-.295.12-.618.18-.947-.18s-.652-.06-.947-.18l-.043-.023c-.549-.223-1.02-.684-1.11-1.226l-.03-.162a4.506 4.506 0 01-.064-.792s.02-.532.064-.792l.03-.162zM14.406 11.06c.09-.542.56-1.003 1.11-1.226l.043-.023c.295-.12.618-.18.947-.18s.652.06.947.18l.043.023c.549.223 1.02.684 1.11 1.226l.03.162c.043.26.064.525.064.792s-.02.532-.064.792l-.03.162c-.09.542-.56 1.004-1.11 1.226l-.043.023c-.295-.12-.618-.18-.947-.18s-.652-.06-.947-.18l-.043-.023c-.549-.223-1.02-.684-1.11-1.226l-.03-.162a4.506 4.506 0 01-.064-.792s.02-.532.064-.792l.03-.162zM4.594 11.06c.09-.542.56-1.003 1.11-1.226l.043-.023c.295-.12.618-.18.947-.18s.652.06.947.18l.043.023c.549.223 1.02.684 1.11 1.226l.03.162c.043.26.064.525.064.792s-.02.532-.064.792l-.03.162c-.09.542-.56 1.004-1.11 1.226l-.043.023c-.295-.12-.618-.18-.947-.18s-.652-.06-.947-.18l-.043-.023c-.549-.223-1.02-.684-1.11-1.226l-.03-.162a4.506 4.506 0 01-.064-.792s.02-.532.064-.792l.03-.162z" />
+            </svg>
+          </button>
+        </div>
+      </div>

      <!-- Board Section -->
      <draggable
        :list="boardColumns"
        group="columns"
        item-key="label.name"
        class="flex gap-6 overflow-x-auto pb-4"
        @end="onColumnDragEnd"
      >
        <template #item="{ element: column }">
          <div
            :data-column-name="column.label.name"
            class="board-column bg-gray-200 rounded-lg w-80 flex-shrink-0"
          >
            <div class="p-4 border-b border-gray-300">
              <h2 class="font-semibold text-lg text-gray-800 cursor-move">{{ column.label.name }} <span class="text-gray-500 font-normal">({{ boardData[column.label.name] ? boardData[column.label.name].length : 0 }})</span></h2>
            </div>
            <draggable
              :list="boardData[column.label.name]"
              group="issues"
              item-key="id"
              class="p-4 space-y-4 min-h-[300px]"
              @end="onDragEnd"
            >
              <template #item="{ element: issue }">
                <div :data-issue-id="issue.id" class="bg-white p-4 rounded-md shadow-sm border border-gray-200 hover:border-blue-500 cursor-move">
                  <a :href="issue.web_url" target="_blank" rel="noopener noreferrer" class="font-medium text-gray-900 hover:text-blue-600 hover:underline" :style="{ fontSize: `${issueTitleFontSize}px` }">
                    {{ issue.title }}
                  </a>
                  <div class="flex flex-wrap gap-2 mt-2">
                    <span
                      v-for="label in issue.labels"
                      :key="label.id"
                      :style="{ backgroundColor: label.color, color: getTextColor(label.color) }"
                      class="px-2 py-1 text-xs font-semibold rounded-full"
                    >
                      {{ label.name }}
                    </span>
                  </div>
                  <div class="flex items-center justify-between mt-3 text-sm">
                    <span class="text-gray-500">#{{ issue.iid }}</span>
                    <div class="flex items-center">
                      <span
                        :style="{ backgroundColor: getProjectColor(issue.project_id), color: getTextColor(getProjectColor(issue.project_id)) }"
                        class="px-2 py-1 text-xs font-semibold rounded-full"
                      >
                        {{ issue.project_name }}
                      </span>
                      <img
                        v-if="issue.assignees && issue.assignees.length > 0"
                        :src="issue.assignees[0].avatar_url"
                        alt="Assignee Avatar"
                        class="w-6 h-6 rounded-full ml-2"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </draggable>
          </div>
        </template>
      </draggable>
    </div>

    <!-- Configuration Modal -->
    <div v-if="showConfigModal" class="fixed inset-0 bg-black bg-opacity-60 z-40 flex justify-center items-center p-4">
      <div class="bg-white p-8 rounded-lg shadow-2xl w-full max-w-2xl relative max-h-[90vh] overflow-y-auto" @click.stop>
        <button @click="showConfigModal = false" class="absolute top-4 right-4 text-2xl text-gray-500 hover:text-gray-800">&times;</button>
        <h1 class="text-2xl font-bold mb-6 text-center">Configuration</h1>
        <form @submit.prevent="saveConfig">
          <div class="mb-4">
            <label for="gitlabUrl" class="block text-gray-700 font-bold mb-2">GitLab URL</label>
            <input id="gitlabUrl" v-model="gitlabUrl" type="text" placeholder="https://gitlab.com" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"/>
          </div>
          <div class="mb-6">
            <label for="gitlabToken" class="block text-gray-700 font-bold mb-2">Personal Access Token</label>
            <input id="gitlabToken" v-model="gitlabToken" type="password" placeholder="your-token" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"/>
          </div>
          <div class="mb-6">
              <label for="refreshInterval" class="block text-gray-700 font-bold mb-2">Auto-refresh Interval (minutes)</label>
              <input id="refreshInterval" v-model.number="refreshIntervalMinutes" type="number" min="0" placeholder="5" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"/>
              <p class="text-xs text-gray-600 mt-1">Set to 0 to disable auto-refresh.</p>
          </div>
          <div class="mb-6">
            <label for="fontSize" class="block text-gray-700 font-bold mb-2">Issue Title Font Size <span class="font-normal text-gray-600">({{ issueTitleFontSize }}px)</span></label>
            <input id="fontSize" v-model.number="issueTitleFontSize" type="range" min="12" max="20" step="1" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"/>
          </div>
          <div class="mb-6">
            <h2 class="text-xl font-bold mb-4">Project Label Colors</h2>
            <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
              <div v-for="(color, index) in projectColors" :key="index" class="relative group">
                <input type="color" v-model="projectColors[index]" class="w-12 h-12 p-1 border rounded-full cursor-pointer"/>
                <button @click.prevent="removeColor(index)" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
              </div>
            </div>
            <div class="mt-4 flex gap-2">
              <button @click.prevent="addColor" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Add Color</button>
              <button @click.prevent="resetColors" class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">Reset to Default</button>
            </div>
          </div>
          <button type="submit" class="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline">Save Configuration</button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #fff;
  position: relative;
  overflow: hidden;
}

.gitlab-logo-animation {
  animation: gitlab-pulse 2s infinite ease-in-out;
}

@keyframes gitlab-pulse {
  0% {
    transform: scale(0.95);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(0.95);
  }
}

.loading-subtext {
  margin-top: 20px;
  color: #4b5563; /* text-gray-600 */
  font-size: 1.125rem;
  font-weight: 500;
}
</style>
