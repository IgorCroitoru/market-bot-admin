variable "tenancy_ocid" {
  description = "OCI tenancy OCID."
  type        = string
}

variable "user_ocid" {
  description = "OCI user OCID used by Terraform."
  type        = string
}

variable "fingerprint" {
  description = "Fingerprint for the OCI API signing key."
  type        = string
}

variable "private_key_path" {
  description = "Path to the private key for the OCI API signing key."
  type        = string
}

variable "region" {
  description = "OCI region, for example eu-frankfurt-1."
  type        = string
}

variable "compartment_ocid" {
  description = "Compartment OCID where the compute resources are created."
  type        = string
}

variable "project_name" {
  description = "Project name used in OCI resource names."
  type        = string
  default     = "cs-tm-bot"
}

variable "environment_name" {
  description = "Environment name used in OCI resource names."
  type        = string
  default     = "dev"
}

variable "ssh_public_key" {
  description = "Public SSH key allowed to access the instance."
  type        = string
}

variable "ssh_allowed_cidr" {
  description = "CIDR allowed to SSH into the instance. Keep narrow for safety."
  type        = string
  default     = "0.0.0.0/0"
}

variable "instance_shape" {
  description = "Always Free eligible Ampere A1 shape."
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "availability_domain_index" {
  description = "Zero-based availability-domain index used for the compute instance. Change this when OCI reports out-of-host-capacity."
  type        = number
  default     = 1

  validation {
    condition     = var.availability_domain_index >= 0 && floor(var.availability_domain_index) == var.availability_domain_index
    error_message = "availability_domain_index must be a non-negative integer."
  }
}

variable "instance_ocpus" {
  description = "OCPUs for the A1 Flex VM. Current Always Free full-month default is 2."
  type        = number
  default     = 2

  validation {
    condition     = var.instance_ocpus > 0 && var.instance_ocpus <= 2
    error_message = "Keep instance_ocpus between 0 and 2 to stay within the current Always Free full-month A1 default."
  }
}

variable "instance_memory_gbs" {
  description = "Memory for the A1 Flex VM. Current Always Free full-month default is 12 GB."
  type        = number
  default     = 12

  validation {
    condition     = var.instance_memory_gbs > 0 && var.instance_memory_gbs <= 12
    error_message = "Keep instance_memory_gbs between 0 and 12 to stay within the current Always Free full-month A1 default."
  }
}

variable "boot_volume_size_gbs" {
  description = "Boot volume size in GB."
  type        = number
  default     = 50
}

variable "node_major_version" {
  description = "Node.js major version installed on the VM."
  type        = number
  default     = 22
}

variable "app_root" {
  description = "Current release symlink used by PM2 on the VM."
  type        = string
  default     = "/opt/market-bot/app"
}

variable "steam_bot_env" {
  description = "Environment variables written to steam-bot/.env on the VM."
  type        = map(string)
  sensitive   = true
}

variable "tm_client_env" {
  description = "Environment variables written to tm-client/.env on the VM."
  type        = map(string)
  sensitive   = true
}

variable "freeform_tags" {
  description = "OCI freeform tags applied to created resources."
  type        = map(string)
  default     = {}
}
