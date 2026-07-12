output "instance_id" {
  description = "OCI compute instance OCID."
  value       = oci_core_instance.apps.id
}

output "instance_public_ip" {
  description = "Public IP address for SSH access."
  value       = oci_core_instance.apps.public_ip
}

output "ssh_command" {
  description = "SSH command for the default Oracle Linux user."
  value       = "ssh opc@${oci_core_instance.apps.public_ip}"
}
