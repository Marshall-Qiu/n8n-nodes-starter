![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

## Install n8n

```
npm install -g n8n
```

## Start n8n

```
n8n
```

## Create Custom Folder Under n8n Folder (for install custom nodes)

```
cd ~/.n8n
```

```
mkdir custom
```

```
cd custom
```

```
npm init // create package.json, use default
```

## Install Custom Node

Build the custom node code at your Custom Node Repo Folder

```
npm run build
```

Go to custom folder in the folder we install n8n

```
cd ~/.n8n/custom
```

```
npm link n8n-nodes-city-weather // the name in the package.json
```

Restart n8n to see the new node

TODO: hard reload
