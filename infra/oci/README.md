# OCI Terraform for tm-client and steam-bot

This stack runs `tm-client` and `steam-bot` on one Oracle Cloud Always Free Ampere A1 VM with Node.js, npm, and PM2.

Oracle currently lists the full-month Always Free Ampere A1 allowance as 2 OCPUs and 12 GB RAM. The defaults in this stack stay inside that limit by using one `VM.Standard.A1.Flex` instance with `instance_ocpus = 2` and `instance_memory_gbs = 12`.

The instance uses availability-domain index `1` by default. If OCI returns `Out of host capacity`, set `availability_domain_index` in `terraform.tfvars` to another available zero-based index (for example `0` or `2`) and run `terraform apply` again.

The app still uses the existing Azure queue, blob, and table environment variables. This only moves the runtime host to OCI compute.

## Files

- `main.tf` creates the VCN, public subnet, SSH security rule, internet gateway, and A1 VM.
- `templates/cloud-init.yaml.tftpl` installs Node.js and PM2, writes app environment files, and creates `/opt/market-bot/bin/deploy-artifact.sh`.
- `terraform.tfvars.example` lists the OCI credentials, SSH settings, and app environment variables you need to fill in.

## Artifact Deploy

The VM does not clone or pull from Git. GitHub Actions builds the repo, creates a tarball artifact, uploads it to `/opt/market-bot/artifacts`, and runs `deploy-artifact.sh` over SSH. The VM unpacks the artifact into `/opt/market-bot/releases/<sha>`, installs production dependencies, updates `/opt/market-bot/app`, and reloads PM2.

GitHub repository variables:

- `OCI_HOST`: the VM public IP or DNS name.
- `OCI_USER`: SSH user. Defaults to `opc` when omitted.
- `OCI_ARTIFACT_DIR`: remote upload directory. Defaults to `/opt/market-bot/artifacts` when omitted.

GitHub repository secrets:

- `OCI_SSH_PRIVATE_KEY`: private key that matches `ssh_public_key` in Terraform.
- `OCI_SSH_KNOWN_HOSTS`: optional pinned SSH known-hosts entry. If omitted, the workflow uses `ssh-keyscan`.

The first Terraform apply prepares the VM but does not start the apps. The first run of `.github/workflows/deploy-oci.yml` uploads and starts the first release.

## Deploy

```powershell
cd infra/oci
Copy-Item terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

After apply:

```powershell
ssh opc@<instance_public_ip>
pm2 status
pm2 logs steam-bot
pm2 logs tm-client
```

To deploy a new commit after SSH:

```bash
sudo /opt/market-bot/bin/deploy-artifact.sh /opt/market-bot/artifacts/<artifact>.tar.gz <release-id>
```

Keep `terraform.tfvars` out of git because it contains secrets and will also place those values in Terraform state.
