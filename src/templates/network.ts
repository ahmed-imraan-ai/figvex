import type { Template } from "./index";

export const networkTemplates: Template[] = [
  {
    id: "net-home",
    engine: "network",
    category: "Architecture & networks",
    title: "Home network",
    summary: "An ISP router, a Wi-Fi access point and the devices on one home subnet.",
    code: `network
title "Home network"
# A device line is: type name "label" addresses.
# Links: -- cable, == trunk or fibre, .. VPN, ~~ wireless.
internet
router hub "ISP router" 192.168.1.1 "DHCP and NAT"
zone home "Home LAN" 192.168.1.0/24
  ap wifi "Wi-Fi" 192.168.1.2
  laptop laptop "Laptop" 192.168.1.20
  phone phone "Phone" 192.168.1.21
  iot tv "Smart TV" 192.168.1.40
  printer printer "Printer" 192.168.1.30
  storage nas "NAS" 192.168.1.50
internet -- hub "fibre"
hub -- wifi, printer, nas
wifi ~~ laptop, phone, tv
`,
  },
  {
    id: "net-office",
    engine: "network",
    category: "Architecture & networks",
    title: "Small office with a DMZ",
    summary: "A firewall with a DMZ for public servers, and staff and guest VLANs on a trunk.",
    code: `network
title "Small office"
internet
firewall fw "Firewall" 203.0.113.2/30
zone dmz "DMZ" 172.16.0.0/24 vlan 30
  server web "Web server" 172.16.0.10
  server mail "Mail server" 172.16.0.11
zone office "Office" 10.10.0.0/16
  switch core "Core switch" 10.10.0.2
  zone staff "Staff" 10.10.10.0/24 vlan 10
    pc desks "Desk PCs" x12
    printer prn "Printer" 10.10.10.5
  zone guest "Guest Wi-Fi" 10.10.20.0/24 vlan 20
    ap guestap "Guest AP" 10.10.20.2
    laptop visitors "Visitors" x5
internet -- fw "WAN"
fw:eth1 -- web, mail
# A name:port at either end labels the port.
fw:eth2 == core:ge0/1 "trunk" vlan 10, 20
core -- desks, prn, guestap
guestap ~~ visitors
`,
  },
  {
    id: "net-campus",
    engine: "network",
    category: "Architecture & networks",
    title: "Campus network (three tiers)",
    summary: "Core, distribution and access switches across two buildings, with redundant uplinks.",
    code: `network
title "Campus network: core, distribution, access"
lines square
router wan "WAN router"
switch core1 "Core 1"
switch core2 "Core 2"
zone library "Library building"
  switch dist1 "Distribution"
  switch acc1 "Access, floor 1"
  switch acc2 "Access, floor 2"
  pc lab1 "Lab PCs" x30
  ap libap "Wi-Fi" x6
zone science "Science building"
  switch dist2 "Distribution"
  switch acc3 "Access"
  pc lab2 "Lab PCs" x24
  camera cctv "CCTV" x8
wan == core1, core2
core1 == core2 "10G"
core1 == dist1, dist2
core2 == dist1, dist2
dist1 -- acc1, acc2
dist2 -- acc3
acc1 -- lab1
acc2 -- libap
acc3 -- lab2, cctv
`,
  },
  {
    id: "net-webapp",
    engine: "network",
    category: "Architecture & networks",
    title: "Three-tier web application",
    summary: "A load balancer, web and API servers and a replicated database in three subnets.",
    code: `network
title "Three-tier web application"
direction right
user users "Users" x3
internet
firewall waf "Web firewall"
zone public "Public subnet" 10.0.1.0/24
  lb lb "Load balancer" 10.0.1.10
  server web1 "Web 1" 10.0.1.21
  server web2 "Web 2" 10.0.1.22
zone app "App subnet" 10.0.2.0/24
  vm api1 "API 1" 10.0.2.11
  vm api2 "API 2" 10.0.2.12
zone data "Data subnet" 10.0.3.0/24
  database db "Primary DB" 10.0.3.10
  database replica "Replica" 10.0.3.11
  storage backup "Backups" 10.0.3.20
users -- internet
internet -- waf
waf -- lb "HTTPS"
lb -- web1, web2
web1 -- api1
web2 -- api2
api1 -- db
api2 -- db
db == replica "replication"
db -- backup "nightly"
`,
  },
  {
    id: "net-vpn",
    engine: "network",
    category: "Architecture & networks",
    title: "Head office and branch over VPN",
    summary: "Two sites joined by an IPsec tunnel across the internet, each with its own LAN.",
    code: `network
title "Head office and branch over VPN"
internet
# A zone without a subnet is a site. Zones inside it are its subnets.
zone hq "Head office"
  firewall hqfw "HQ firewall" 198.51.100.2
  zone hqlan "HQ LAN" 10.1.0.0/24 vlan 10
    switch hqsw "Switch" 10.1.0.2
    server files "File server" 10.1.0.10
    pc hqpcs "Staff PCs" x20
zone branch "Branch office"
  firewall brfw "Branch firewall" 203.0.113.6
  zone brlan "Branch LAN" 10.2.0.0/24 vlan 10
    pc brpcs "Staff PCs" x6
    printer brprn "Printer" 10.2.0.5
internet -- hqfw, brfw
hqfw .. brfw "IPsec tunnel"
hqfw -- hqsw
hqsw -- files, hqpcs
brfw -- brpcs, brprn
`,
  },
  {
    id: "net-subnetting",
    engine: "network",
    category: "Architecture & networks",
    title: "Subnetting exercise",
    summary: "A /24 split into four /26 subnets, with one mistake for the address checks to catch.",
    code: `network
title "Subnetting 192.168.10.0/24 into four /26s"
# Each /26 has 64 addresses: the network, 62 for devices and the broadcast.
# One address below is wrong. The checks mark it in the editor and on the diagram.
router r1 "Router" 192.168.10.1 192.168.10.65 192.168.10.129 192.168.10.193
zone sales "Sales" 192.168.10.0/26 vlan 10
  switch s1 "Sales switch" 192.168.10.2
  pc sales1 "Sales PC" 192.168.10.10
zone eng "Engineering" 192.168.10.64/26 vlan 20
  switch s2 "Eng switch" 192.168.10.66
  pc eng1 "Eng PC" 192.168.10.70
zone hr "HR" 192.168.10.128/26 vlan 30
  switch s3 "HR switch" 192.168.10.130
  pc hr1 "HR PC" 192.168.10.191
zone mgmt "Management" 192.168.10.192/26 vlan 99
  switch s4 "Mgmt switch" 192.168.10.194
  server mon "Monitoring" 192.168.10.200
r1 -- s1, s2, s3, s4
s1 -- sales1
s2 -- eng1
s3 -- hr1
s4 -- mon
`,
  },
  {
    id: "net-physical",
    engine: "network",
    category: "Architecture & networks",
    title: "Comms rack and floor plan",
    summary: "The same small office three ways: the logical network, the rack it lives in, and a floor plan with cable runs.",
    code: `network
title "Small office: logical and physical"
internet
firewall fw "Firewall" 10.0.0.1
switch core "Core switch" 10.0.0.2
server nas "File server" 10.0.0.10
ap wap "Wi-Fi" 10.0.0.3
pc desk1 "Desk 1" 10.0.0.21
pc desk2 "Desk 2" 10.0.0.22
printer prn "Printer" 10.0.0.30
laptop lap "Laptop"
internet -- fw
fw -- core
core -- nas, wap, desk1, desk2, prn
wap ~~ lap

# A rack elevation: the unit (counting from 1 at the bottom), then a
# device from above or a part: patch, blank, shelf, ups, pdu, cable, kvm.
rack r1 "Comms rack" 12U
  12 patch "Patch panel"
  11 cable
  10 core
  9 fw
  6-7 nas
  1-2 ups "UPS"

# A floor plan in metres: rooms as x y width depth, devices at x y.
# Cables follow the links above, with an estimated length.
floor g "Ground floor" 20x10
  room "Office" 0 0 14 10
  room "Comms" 14 0 6 5
  room "Print" 14 5 6 5
  core 17 2
  desk1 3 3
  desk2 3 7
  wap 8 5
  lap 10 7
  prn 17 8
`,
  },
];
