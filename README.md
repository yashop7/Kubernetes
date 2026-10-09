# Kubernetes – Learning Journey

Hands-on Kubernetes practice: starting with a single Pod on a local `kind` cluster, working up to Ingress, autoscaling, and GitOps with ArgoCD.
Each numbered folder is one topic, with the manifests I wrote and applied.

| # | Folder | Topic |
|---|--------|-------|
| 1 | [1.ClusterStart-Manifest](1.ClusterStart-Manifest/) | Local cluster with kind + first Pod |
| 2 | [2.ReplicaSet](2.ReplicaSet/) | ReplicaSet – keep N pods alive |
| 3 | [3.Deployment](3.Deployment/) | Deployment – rollouts on top of ReplicaSets |
| 4 | [4.Backend-Postgres-Cluster](4.Backend-Postgres-Cluster/) | Bun + Express + Prisma backend (app side) |
| 5 | [5.Service.yml](5.Service.yml/) | Services – NodePort & LoadBalancer |
| 6 | [6.DO_Cluster+NameSpaces](6.DO_Cluster+NameSpaces/) | DigitalOcean cluster + Namespaces |
| 7 | [7.Deploy-app](7.Deploy-app/) | Full app: backend + Postgres + manual nginx reverse proxy |
| 8 | [8.Ingress_DeployApp](8.Ingress_DeployApp/) | Ingress controller + Ingress rules |
| 9 | [9.Horizontal-Pod-AutoScaler](9.Horizontal-Pod-AutoScaler/) | HPA – autoscaling on CPU |
| 10 | [10.ArgoCD-GitOps](10.ArgoCD-GitOps/) | ArgoCD – GitOps deployments |

---

## 1. Cluster setup & first Pod

**Folder:** [1.ClusterStart-Manifest](1.ClusterStart-Manifest/)

- Created a local multi-node cluster using **kind** (Kubernetes in Docker): 1 control-plane + 2 worker nodes.
- Wrote my first manifest: a single `nginx` **Pod**.

```bash
kind create cluster --config clusters.yml --name local
kubectl get nodes
kubectl apply -f manifest.yml
kubectl get pods
kubectl port-forward pod/nginx 8080:80
```

**What I learned**
- A **Pod** is the smallest deployable unit: one or more containers sharing network and storage.
- The **control plane** (API server, scheduler, etcd, controller manager) decides; the **worker nodes** (kubelet, kube-proxy, container runtime) run the pods.
- A bare Pod is not self-healing: if it dies, nothing recreates it.

---

## 2. ReplicaSet

**Folder:** [2.ReplicaSet](2.ReplicaSet/)

- Created a ReplicaSet running **3 nginx replicas**, selected by the label `app: nginx`.

**What I learned**
- A ReplicaSet keeps the desired number of pods running. Delete one and it immediately creates a replacement.
- `selector.matchLabels` must match `template.metadata.labels`. That is how the ReplicaSet knows which pods it owns.
- I rarely create ReplicaSets directly; Deployments manage them.

---

## 3. Deployment

**Folder:** [3.Deployment](3.Deployment/)

- Same 3-replica nginx app, created as a **Deployment** this time.

```bash
kubectl apply -f deployment.yml
kubectl get deployments,rs,pods
kubectl rollout status deployment/nginx-deployment
kubectl rollout undo deployment/nginx-deployment
```

**What I learned**
- Deployment → manages ReplicaSets → manage Pods.
- Changing the image creates a **new ReplicaSet** and does a **rolling update**; the old ReplicaSet is kept for **rollback**.
- `containerPort` is mostly documentation; it doesn't actually open or restrict the port.

---

## 4. Backend app (Bun + Express + Prisma)

**Folder:** [4.Backend-Postgres-Cluster](4.Backend-Postgres-Cluster/)

- Set up a backend with **Bun**, **Express**, and **Prisma** (Postgres), to containerize and run in the cluster later.

**What I learned**
- To run an app on Kubernetes, it first has to be packaged as an image and pushed to a registry (Docker Hub).
- Configuration (port, DB URL) should come from environment variables, not be hardcoded.

---

## 5. Services – NodePort & LoadBalancer

**Folder:** [5.Service.yml](5.Service.yml/)

- Exposed the nginx pod using:
  - **NodePort** service on port `30007`
  - **LoadBalancer** service (gets an external IP on a cloud provider)
- Recreated the kind cluster with `extraPortMappings` so `localhost:30007` on my laptop reaches the NodePort inside the cluster.

```bash
kind create cluster --config cluster-changes.yml
kubectl apply -f demo-nginx-pod.yml
kubectl apply -f NodePort-service.yml
curl http://localhost:30007
```

**What I learned**
- Pod IPs change whenever pods restart. A **Service** gives a stable IP/DNS name and load-balances across pods matched by its `selector`.
- Service types:
  - **ClusterIP** (default): reachable only inside the cluster.
  - **NodePort**: opens a port (30000–32767) on every node.
  - **LoadBalancer**: the cloud provider creates an external load balancer. This doesn't work on plain kind.
- `port` = the Service's port, `targetPort` = the container's port, `nodePort` = the port on the node.

---

## 6. DigitalOcean cluster + Namespaces

**Folder:** [6.DO_Cluster+NameSpaces](6.DO_Cluster+NameSpaces/)

- Moved from kind to a managed **DigitalOcean Kubernetes** cluster (downloaded the kubeconfig and switched context).
- Deployed nginx into a separate **namespace**, `backend-team`.

```bash
kubectl create namespace backend-team
kubectl apply -f manifest-deployment-nginx.yml
kubectl get pods -n backend-team
kubectl config get-contexts
```

**What I learned**
- **Namespaces** logically split one cluster (per team or environment).
- Most resources are namespaced, so remember `-n <namespace>`.
- On a cloud cluster, `type: LoadBalancer` actually provisions a real load balancer with a public IP.

---

## 7. Deploying a full app (backend + Postgres + reverse proxy)

**Folder:** [7.Deploy-app/k8s-manual-ingress](7.Deploy-app/k8s-manual-ingress/)

Architecture:

```
Internet ──► LoadBalancer Service (ingress)
                 │
                 ▼
          nginx pod (reverse proxy, config from ConfigMap)
                 │
                 ▼
          backend Service (ClusterIP :3000) ──► backend pods (x2)
                                                     │
                                                     ▼
                                   db Service (ClusterIP :5432) ──► postgres pod
```

- **Backend:** Express app with `/users` GET/POST, built with a Bun-based [Dockerfile](7.Deploy-app/k8s-manual-ingress/express/Dockerfile), pushed as `yashop7/backend-pg-k8s-lec4:1`, run as 2 replicas.
- **DB:** `postgres:latest` Deployment, with the password set via an `env` variable, exposed internally with a ClusterIP Service.
- **Reverse proxy:** an nginx Deployment whose `nginx.conf` comes from a **ConfigMap** (mounted with `subPath`), exposed using a LoadBalancer.

**What I learned**
- **Cluster DNS:** services are reachable as `<service>.<namespace>.svc.cluster.local`. For example, the backend talks to `db.default.svc.cluster.local:5432`.
- **ConfigMaps** inject config files and env vars without rebuilding the image.
- Internal components (DB, backend) should be **ClusterIP**; only the entry point should be public.
- Running nginx myself as a reverse proxy is basically a manual Ingress. That is why Ingress controllers exist.
- Secrets like DB passwords belong in a **Secret**, not as plain `env` values (to improve later).
- Postgres in a plain Deployment without a volume loses its data on restart. It needs a PersistentVolume/StatefulSet.

---

## 8. Ingress

**Folder:** [8.Ingress_DeployApp](8.Ingress_DeployApp/)

- Installed the **ingress-nginx controller** from the official manifest.
- Deployed two apps, each with a ClusterIP Service:
  - `backend-service` → nginx pods
  - `frontend-service` → apache (httpd) pods
- Wrote an **Ingress** resource that routes by host and path:

| Host | Path | Service |
|------|------|---------|
| `yashtwt.me` | `/backend` | `backend-service:80` |
| `yashtwt.me` | `/frontend` | `frontend-service:80` |

```bash
kubectl apply -f ingress-deployment-controller.yml
kubectl apply -f backend-manifest.yml -f frontend-manifest.yml
kubectl apply -f ingress.yml
kubectl get ingress
kubectl get svc -n ingress-nginx
```

**What I learned**
- **Ingress** = HTTP routing rules (host/path → Service). An **Ingress Controller** (nginx, traefik, ...) actually enforces them. The Ingress resource alone does nothing.
- One LoadBalancer (the controller's) can serve many apps, instead of one LoadBalancer per service, which is cheaper.
- `ingressClassName: nginx` selects which controller handles the Ingress.
- `rewrite-target: /` strips the path prefix before forwarding, so `/backend` reaches the app as `/`.
- Point the domain's DNS A record at the ingress controller's external IP.

---

## 9. Horizontal Pod Autoscaler (HPA)

**Folder:** [9.Horizontal-Pod-AutoScaler](9.Horizontal-Pod-AutoScaler/)

- Deployed a CPU-heavy app (`100xdevs/week-28`) with **resource requests/limits** (`100m` request, `1000m` limit), exposed on NodePort `30007`.
- Created an **HPA**: min 2, max 5 replicas, target **50% average CPU**.

```bash
kubectl apply -f deployment-service-manifest.yml
kubectl apply -f hpa-manifest.yml
kubectl get hpa -w
kubectl top pods
```

**What I learned**
- HPA scales the replica count based on metrics. It needs **metrics-server** installed in the cluster.
- CPU utilization % is calculated against the **request**, so without `resources.requests` the HPA can't work.
- **Requests** = guaranteed resources used for scheduling; **limits** = the hard cap (CPU gets throttled, memory gets OOM-killed).
- Under load the replicas go up toward 5; when load drops they scale back down to 2 after a cooldown.
- HPA scales pods; scaling nodes is the **Cluster Autoscaler**'s job.

---

## 10. ArgoCD & GitOps

**Folder:** [10.ArgoCD-GitOps](10.ArgoCD-GitOps/) · full steps in [installation.md](10.ArgoCD-GitOps/installation.md)
**Test repo:** https://github.com/yashop7/Argo-deployment

- Installed ArgoCD in the `argocd` namespace, opened the UI using port-forward, and logged in with the initial admin secret.
- Created an ArgoCD Application pointing at my Git repo; ArgoCD synced it and deployed the `nginx` and `httpd` pods, and I verified they were running.

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl port-forward svc/argocd-server -n argocd 8080:443
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

**What I learned**
- **GitOps:** Git is the single source of truth for cluster state. No more manual `kubectl apply`.
- ArgoCD runs inside the cluster and **pulls** from Git (compared with CI pipelines that push to the cluster).
- It shows **Synced / OutOfSync** and **Healthy / Degraded** status per app.
- **Auto-sync + self-heal** reverts manual changes made to the cluster back to what's in Git.
- Rollback = `git revert`.

---

## Key Concepts Cheat Sheet

| Concept | One-liner |
|---------|-----------|
| Pod | Smallest unit; wraps container(s) |
| ReplicaSet | Keeps N identical pods running |
| Deployment | Manages ReplicaSets; rolling updates & rollbacks |
| Service | Stable IP/DNS + load balancing for pods |
| ClusterIP / NodePort / LoadBalancer | Internal only / port on every node / cloud LB |
| Namespace | Logical partition inside a cluster |
| ConfigMap / Secret | Non-sensitive / sensitive config injected into pods |
| Ingress + Controller | L7 HTTP routing by host/path behind one LB |
| HPA | Auto-scale replicas on CPU/memory metrics |
| Requests / Limits | Guaranteed resources / hard cap |
| ArgoCD | GitOps CD tool – syncs cluster with Git |

## Common kubectl Commands

```bash
kubectl get pods|deploy|rs|svc|ingress|hpa [-n ns] [-o wide]
kubectl describe pod <name>
kubectl logs <pod> [-f]
kubectl exec -it <pod> -- sh
kubectl apply -f <file.yml>
kubectl delete -f <file.yml>
kubectl port-forward svc/<name> 8080:80
kubectl scale deployment <name> --replicas=5
kubectl rollout status|history|undo deployment/<name>
kubectl config get-contexts / use-context <ctx>
```

## Tools Used

- **kind** – local multi-node clusters in Docker
- **DigitalOcean Kubernetes** – managed cloud cluster
- **Docker / Docker Hub** – building and hosting images
- **Bun + Express + Postgres** – sample backend
- **ingress-nginx** – Ingress controller
- **ArgoCD** – GitOps continuous delivery

## Next Steps

- [ ] Move the DB password into a **Secret**
- [ ] Run Postgres as a **StatefulSet** with a **PersistentVolumeClaim**
- [ ] Add **liveness/readiness probes**
- [ ] TLS on the Ingress with **cert-manager**
- [ ] Package the apps with **Helm** and deploy through ArgoCD
