import React from "react"

import { Renderer, Common } from "@k8slens/extensions";
import { IpcRenderer } from "./src/ipc/renderer";
import { Logger } from "./src/utils/logger";

import {
  ClusterPageIcon,
  ClusterPage,
  KubescapePreferenceInput,
  KubescapePreferenceHint,
  KubescapeWorkloadDetails
} from "./src/components";

import {
  KubescapePreferenceStore,
  KubescapeReportStore
} from "./src/stores";

import {
  SCAN_CLUSTER_EVENT_NAME,
  SCAN_CLUSTER_TASK_INTERVAL_MS
} from "./src/utils/consts";

import { parseScanResult } from "./src/kubescape/scanResults";

export default class KubescapeExtension extends Renderer.LensExtension {
  clusterPages = [
    {
      id: "kubescape-main",
      components: {
        Page: () => <ClusterPage />,
      }
    }
  ]

  /* Sidebar menu */
  clusterPageMenus = [
    {
      target: { pageId: "kubescape-main" },
      title: "Kubescape",
      components: {
        Icon: ClusterPageIcon,
      }
    }
  ]

  /* workload object details */
  kubeObjectDetailItems = [
    {
      kind: "Node",
      apiVersions: ["v1"],
      priority: 9,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.Node>) => <KubescapeWorkloadDetails<Renderer.K8sApi.Node> {...props} />
      }
    },
    {
      kind: "Pod",
      apiVersions: ["v1"],
      priority: 10,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.Pod>) => <KubescapeWorkloadDetails<Renderer.K8sApi.Pod> {...props} />
      }
    },
    {
      kind: "Deployment",
      apiVersions: ["apps/v1"],
      priority: 10,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.Deployment>) => <KubescapeWorkloadDetails<Renderer.K8sApi.Deployment> {...props} />
      }
    },
    {
      kind: "DaemonSet",
      apiVersions: ["apps/v1"],
      priority: 10,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.DaemonSet>) => <KubescapeWorkloadDetails<Renderer.K8sApi.DaemonSet> {...props} />
      }
    },
    {
      kind: "StatefulSet",
      apiVersions: ["apps/v1"],
      priority: 10,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.StatefulSet>) => <KubescapeWorkloadDetails<Renderer.K8sApi.StatefulSet> {...props} />
      }
    },
    {
      kind: "ReplicaSet",
      apiVersions: ["apps/v1"],
      priority: 10,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.ReplicaSet>) => <KubescapeWorkloadDetails<Renderer.K8sApi.ReplicaSet> {...props} />
      }
    },
    {
      kind: "ServiceAccount",
      apiVersions: ["v1"],
      priority: 10,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.ServiceAccount>) => <KubescapeWorkloadDetails<Renderer.K8sApi.ServiceAccount> {...props} />
      }
    },
    {
      kind: "CronJob",
      apiVersions: ["batch/v1beta1"],
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.CronJob>) => <KubescapeWorkloadDetails<Renderer.K8sApi.CronJob> {...props} />
      },
    },
  ]

  appPreferences = [
    {
      title: "Kubescape Preferences",
      components: {
        Hint: () => <KubescapePreferenceHint />,
        Input: () => <KubescapePreferenceInput />
      }
    }
  ]

  async onActivate() {
    Logger.debug("Kubescape activated");
    IpcRenderer.createInstance(this);
    KubescapePreferenceStore.createInstance().loadExtension(this);
    KubescapeReportStore.createInstance().loadExtension(this);

    setTimeout(() => this.scanClusterTask(), SCAN_CLUSTER_TASK_INTERVAL_MS);
  }

  scanClusterTask = async () => {
    const preferenceStore = KubescapePreferenceStore.getInstance();
    const reportStore = KubescapeReportStore.getInstance();
    const ipc = IpcRenderer.getInstance();

    if (!preferenceStore.isInstalled) {
      Logger.debug('Kubescape is not installed');
      return;
    }
    const activeEntity = Renderer.Catalog.catalogEntities.activeEntity;
    if (!activeEntity || !(activeEntity instanceof Common.Catalog.KubernetesCluster)) {
      Logger.debug('No cluster selected');
      return;
    }

    const clusterId = activeEntity.getId();
    const clusterName = activeEntity.getName();

    let scanResult = reportStore.scanResults.find(result => result.clusterId == clusterId);

    if (scanResult) {
      if (!scanResult.isScanning) {
        Logger.debug(`Cluster '${clusterName}' - already scanned`);
        return;
      }
    } else {
      reportStore.scanResults.push({
        clusterId: clusterId,
        clusterName: clusterName,
        controls: null,
        frameworks: null,
        isScanning: true,
        time: Date.now()
      });
    }

    Logger.debug(`Invoking cluster scan on '${clusterName}'`);
    const scanClusterResult = await ipc.invoke(SCAN_CLUSTER_EVENT_NAME, clusterName);
    const [controls, frameworks] = parseScanResult(scanClusterResult);

    scanResult = reportStore.scanResults.find(result => result.clusterId == clusterId);

    if (scanResult) {
      // Update Store
      scanResult.controls = controls;
      scanResult.frameworks = frameworks;

      Logger.debug(`Saved scan result of cluster '${clusterName}'`);

      scanResult.isScanning = false;
    } else {
      Logger.error('Scan results error - push was not synced')
    }
    setTimeout(() => this.scanClusterTask(), SCAN_CLUSTER_TASK_INTERVAL_MS);
  }
}
