# Aula 9. Colocar no ar

## O que você vai conseguir

O CRM rodando sem o seu computador ligado, num endereço fixo, voltando sozinho
depois de um reinício.

---

## O que muda de verdade

Uma coisa só: **o endereço público deixa de mudar**.

O túnel rápido da aula 2 é anônimo e descartável por natureza. Ele cai, e quando
volta, volta com outro nome. O `npm run tunel` conserta isso em dois minutos, mas
conserta uma coisa que não deveria acontecer.

Com domínio próprio, o webhook da uazapi nunca mais precisa ser reapontado. Todo
o resto desta aula é consequência disso.

---

## O que você vai precisar

| O quê | Custo aproximado |
|---|---|
| Uma VPS pequena (2 GB dão conta) | 5 a 20 USD por mês |
| Um domínio | ~40 BRL por ano |

Hetzner, DigitalOcean, Vultr, Contabo. Qualquer uma serve.

---

## Passo a passo

### 1. Aponte três subdomínios

```
crm.suaempresa.com.br    ──►  a tela
api.suaempresa.com.br    ──►  a API      (porta 4000)
zap.suaempresa.com.br    ──►  a ponte    (porta 4200)
```

Três registros `A` para o IP da VPS.

Só o `zap` precisa mesmo ser público: é ele que a uazapi chama. Separar os três
deixa o log legível e permite fechar um sem fechar os outros.

### 2. Prepare a VPS

Node 20+, `git`, e um proxy com HTTPS. O [Caddy](https://caddyserver.com) é o
caminho mais curto: ele tira o certificado sozinho.

```
crm.suaempresa.com.br {
  root * /opt/crm/dist
  file_server
  try_files {path} /index.html
}

api.suaempresa.com.br {
  reverse_proxy 127.0.0.1:4000
}

zap.suaempresa.com.br {
  reverse_proxy 127.0.0.1:4200
}
```

### 3. Leve o código e instale

```bash
git clone SEU_REPOSITORIO /opt/crm
cd /opt/crm
npm install
npm --prefix backend install
npm --prefix whatsapp install
```

### 4. Ajuste o `.env`

Este é o passo que faz a diferença:

```env
NODE_ENV=production

CORS_ORIGIN=https://crm.suaempresa.com.br
APP_URL=https://crm.suaempresa.com.br
VITE_API_URL=https://api.suaempresa.com.br
PUBLIC_API_URL=https://api.suaempresa.com.br

BACKEND_URL=http://127.0.0.1:4000
WHATSAPP_BRIDGE_URL=http://127.0.0.1:4200

# A LINHA QUE APOSENTA O TÚNEL
WHATSAPP_BRIDGE_PUBLIC_URL=https://zap.suaempresa.com.br
```

No Supabase, em **Authentication → URL Configuration**, ponha
`https://crm.suaempresa.com.br` como Site URL.

### 5. Compile

```bash
npm run build
npm run build:backend
npm run build:whatsapp
```

### 6. Mantenha de pé

Um serviço `systemd` por processo, em `/etc/systemd/system/`:

```ini
[Unit]
Description=CRM API
After=network.target

[Service]
WorkingDirectory=/opt/crm/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
User=crm

[Install]
WantedBy=multi-user.target
```

O mesmo para a ponte, apontando para `/opt/crm/whatsapp`.

```bash
sudo systemctl enable --now crm-api crm-zap
```

**`Restart=always` é o ponto.** Sem ele, o primeiro erro não tratado derruba o
atendimento até alguém perceber.

### 7. Backup

O Supabase faz backup automático no plano pago. No plano grátis, **não**.

Se o seu CRM tem conversa de cliente dentro, saia do plano grátis. Um banco sem
backup é uma questão de tempo.

---

## O teste da aula

1. Mande uma mensagem de outro celular. Ela aparece em Chats ao vivo.
2. **Reinicie o servidor** (`sudo reboot`).
3. Espere ele voltar e mande outra mensagem.

**O segundo teste é o que importa.** Ele prova que tudo volta sozinho, que é a
única diferença real entre "está no ar" e "está rodando enquanto eu não mexer".

---

## Erros comuns

**A tela abre e o login falha.** O Site URL no Supabase ainda aponta para
localhost.

**Erro de CORS.** O `CORS_ORIGIN` não bate com o endereço da tela, letra por
letra. `https` e `http` são endereços diferentes.

**A mensagem não chega depois da mudança.** O webhook da uazapi ainda aponta para
o túnel antigo. Espere dois minutos: o vigia confere e reaponta sozinho. Ou abra
Conexões e reconecte.

**Tudo volta menos a ponte.** O serviço `systemd` dela está com o
`WorkingDirectory` errado, ou o `npm run build:whatsapp` não foi rodado e não
existe `dist/`.

---

Próxima: [Aula 10. O método](10-o-metodo.md).
