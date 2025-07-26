function convert() {
  const direction = document.getElementById('direction').value;
  const input = document.getElementById('input').value;
  const lines = input.split('\n');
  let output = '';

  if (direction === 'aruba-to-cisco') {
    output = convertArubaToCisco(lines);
  } else {
    output = convertCiscoToAruba(lines);
  }

  document.getElementById('output').value = output.trim();
}

function convertArubaToCisco(lines) {
  let currentVlan = '';
  let vlanInterfaces = {};
  let output = '';
  let hostname = '';
  let defaultGateway = '';

  for (let line of lines) {
    line = line.trim();

    if (line.startsWith('hostname')) {
      hostname = line.split('"')[1] || line.split(' ')[1];
      output += `hostname ${hostname}\n`;
    }

    if (line.startsWith('ip default-gateway')) {
      defaultGateway = line;
      output += `${defaultGateway}\n`;
    }

    if (line.startsWith('vlan')) {
      currentVlan = line.split(' ')[1];
      output += `vlan ${currentVlan}\n`;
    } else if (line.startsWith('name')) {
      const name = line.split('"')[1] || line.split(' ')[1];
      output += ` name ${name}\n`;
    } else if (line.startsWith('ip address')) {
      output += `interface vlan${currentVlan}\n ip address ${line.split('ip address ')[1]}\n no ip route cache\n`;
    } else if (line.startsWith('untagged') || line.startsWith('tagged')) {
      const ports = line.split(' ')[1];
      const portList = expandPorts(ports);
      const mode = line.startsWith('untagged') ? 'access' : 'trunk';

      portList.forEach(p => {
        const intName = `interface FastEthernet0/${p}`;
        if (!vlanInterfaces[intName]) {
          vlanInterfaces[intName] = {
            access: null,
            trunk: []
          };
        }

        if (mode === 'access') {
          vlanInterfaces[intName].access = currentVlan;
        } else {
          vlanInterfaces[intName].trunk.push(currentVlan);
        }
      });
    }
  }

  for (const [intf, cfg] of Object.entries(vlanInterfaces)) {
    output += `${intf}\n`;
    if (cfg.access) {
      output += ` description Port ${intf.split('/').pop()}\n switchport mode access\n switchport access vlan ${cfg.access}\n spanning-tree portfast\n`;
    }
    if (cfg.trunk.length > 0) {
      output += ` switchport trunk encapsulation dot1q\n switchport mode trunk\n switchport trunk allowed vlan ${cfg.trunk.join(',')}\n`;
    }
  }

  return output;
}

function convertCiscoToAruba(lines) {
  let output = '';
  let vlanMap = {};
  let currentInterface = '';
  let defaultGateway = '';
  let hostname = '';
  let vlanIPs = {};

  for (let line of lines) {
    line = line.trim();

    if (line.startsWith('hostname')) {
      hostname = line.split(' ')[1];
      output += `hostname "${hostname}"\n`;
    }

    if (line.startsWith('ip default-gateway')) {
      defaultGateway = line;
      output += `${defaultGateway}\n`;
    }

    if (line.startsWith('vlan')) {
      const vlanId = line.split(' ')[1];
      vlanMap[vlanId] = { name: '', untagged: [], tagged: [], ip: '' };
    }

    if (line.startsWith('name') && currentInterface === '') {
      const name = line.split(' ')[1];
      const vlanId = Object.keys(vlanMap).pop();
      vlanMap[vlanId].name = `"${name}"`;
    }

    if (line.startsWith('interface vlan')) {
      const vlanId = line.split(' ')[1].replace('vlan', '');
      currentInterface = `vlan-${vlanId}`;
    }

    if (line.startsWith('ip address') && currentInterface.includes('vlan')) {
      const vlanId = currentInterface.split('-')[1];
      vlanMap[vlanId].ip = line.split('ip address ')[1];
    }

    if (line.startsWith('interface') && line.includes('FastEthernet')) {
      currentInterface = line.match(/FastEthernet0\/(\d+)/)[1];
    }

    if (line.includes('switchport access vlan')) {
      const vlanId = line.split('vlan ')[1];
      if (vlanMap[vlanId]) vlanMap[vlanId].untagged.push(currentInterface);
      else vlanMap[vlanId] = { name: '', untagged: [currentInterface], tagged: [], ip: '' };
    }

    if (line.includes('switchport trunk allowed vlan')) {
      const vlanIds = line.split('vlan ')[1].split(',').map(v => v.trim());
      vlanIds.forEach(vlanId => {
        if (!vlanMap[vlanId]) vlanMap[vlanId] = { name: '', untagged: [], tagged: [], ip: '' };
        vlanMap[vlanId].tagged.push(currentInterface);
      });
    }
  }

  for (const [vlan, data] of Object.entries(vlanMap)) {
    output += `vlan ${vlan}\n`;
    if (data.name) output += ` name ${data.name}\n`;
    if (data.ip) output += ` ip address ${data.ip}\n`;
    if (data.untagged.length > 0) output += ` untagged ${data.untagged.join(',')}\n`;
    if (data.tagged.length > 0) output += ` tagged ${data.tagged.join(',')}\n`;
    output += ` exit\n`;
  }

  return output;
}

function expandPorts(portStr) {
  const ports = [];
  portStr.split(',').forEach(token => {
    if (token.includes('-')) {
      const [start, end] = token.split('-').map(n => parseInt(n));
      for (let i = start; i <= end; i++) {
        ports.push(i.toString());
      }
    } else {
      ports.push(token.trim());
    }
  });
  return ports;
}
