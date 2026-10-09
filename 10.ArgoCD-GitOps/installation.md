# ArgoCD – Installation & What I Did

ArgoCD is a GitOps tool for Kubernetes: it watches a Git repo and keeps the cluster in sync with the manifests stored there.

**Test repo:** https://github.com/yashop7/Argo-deployment

---

## 1. Installation Steps

### Approach 1 – Install on any cluster (what I used)

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Check that all ArgoCD pods are running:

```bash
kubectl get pods -n argocd
```

### Approach 2 – DigitalOcean Marketplace

On DigitalOcean Kubernetes, ArgoCD can be installed as a 1-click app from the Marketplace.

### Install the ArgoCD CLI (optional, recommended)

```bash
brew install argocd
```

---

## 2. Access the ArgoCD UI

Port-forward the ArgoCD server service:

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Open https://localhost:8080 (accept the self-signed certificate warning).

### Get the admin password

Username: `admin`

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

> The raw secret is base64-encoded, so pipe it through `base64 -d` to get the real password.

---

## 3. What I Tested

1. Installed ArgoCD in my Kubernetes cluster (namespace `argocd`).
2. Logged in to the UI via port-forward.
3. Pushed manifests to my Git repo [Argo-deployment](https://github.com/yashop7/Argo-deployment).
4. Created an ArgoCD **Application** pointing at that repo.
5. ArgoCD synced the repo and deployed the resources into the cluster.
6. Verified the pods were running and working.

### Manifest deployed ([manifest-argoCD.yml](manifest-argoCD.yml))

Two simple pods, both exposing port 80:

| Pod     | Image   | Port |
|---------|---------|------|
| `nginx` | `nginx` | 80   |
| `httpd` | `httpd` | 80   |

### Verify the pods

```bash
kubectl get pods
kubectl describe pod nginx
kubectl port-forward pod/nginx 8081:80   # then open http://localhost:8081
kubectl port-forward pod/httpd 8082:80   # then open http://localhost:8082
```

Both pods served their default pages, so the deployment through ArgoCD worked.

---

## 4. GitOps Flow

```
Git repo (manifests)  ──►  ArgoCD (watches repo)  ──►  Kubernetes cluster
        ▲                                                      │
        └──────────── change in Git = change in cluster ───────┘
```

- Git is the single source of truth.
- If I change a manifest in Git, ArgoCD detects the diff (**OutOfSync**) and syncs it.
- With auto-sync + self-heal enabled, manual changes in the cluster are reverted back to what Git says.

---

## 5. Debugging

```bash
# Application controller logs
kubectl logs -n argocd deployment/argocd-application-controller

# Repo server logs (Git fetch / manifest rendering issues)
kubectl logs -n argocd deployment/argocd-repo-server

# Check all ArgoCD pods
kubectl get pods -n argocd
```

CLI alternatives:

```bash
argocd login localhost:8080
argocd app list
argocd app get <app-name>
argocd app sync <app-name>
```
