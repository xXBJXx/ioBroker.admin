import React, { Component } from 'react';

import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import { usePreview } from 'react-dnd-preview';
import clsx from 'clsx';

import EnumBlock from './EnumBlock';
import CategoryLabel from './CategoryLabel';
import EnumEditDialog from './EnumEditDialog';
import EnumTemplateDialog from './EnumTemplateDialog';
import EnumDeleteDialog from './EnumDeleteDialog';
import DragObjectBrowser from './DragObjectBrowser'

import Tooltip from '@material-ui/core/Tooltip';
import LinearProgress from '@material-ui/core/LinearProgress';
import PropTypes from 'prop-types';
import Grid from '@material-ui/core/Grid';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import TextField from '@material-ui/core/TextField';
import Popover from '@material-ui/core/Popover';
import MenuItem from '@material-ui/core/MenuItem';
import MenuList from '@material-ui/core/MenuList';
import IconButton from '@material-ui/core/IconButton';

import AddIcon from '@material-ui/icons/Add';
import { FaRegFolder as IconCollapsed } from 'react-icons/fa';
import { FaRegFolderOpen as IconExpanded } from 'react-icons/fa';

import {withStyles} from '@material-ui/core/styles';


const styles = theme => ({
    mainGridCont: {
        height: '100%',
        overflowY:'auto'
    },
    childGridCont: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
    },
    childGridContWide: {
        height: '100%',
    },
    blocksContainer: {
        overflowY: 'auto',
        overflowX: 'hidden'
    },
    canDrop:{
        backgroundColor: theme.palette.background.default
    },
    icon: {
        height: 32,
        width: 32,
        marginRight: 5,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'inline-block'
    },
    categoryTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        display: 'inline-flex'
    },
    enumTemplateDialog: {
        overflowY: 'auto',
        textAlign: 'center'
    },
    enumTemplate: {
        display: 'inline-flex',
        padding: 10,
        width: 200
    },
    toolbarButton: {
        //marginRight: theme.spacing(1),
        display: 'inline',
    },
    filter: {
        width: '100%',
        paddingRight: 20
    },
    topPanel: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 20
    },
    topPanel2: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '4px 20px',
        justifyContent: 'space-between'
    }
});

const DndPreview = () => {
    const {display/*, itemType*/, item, style} = usePreview();
    let divStyle = {...style};
    divStyle.zIndex = 10000;

    if (!display) {
        return null;
    }

    return <div style={divStyle}>{item.preview}</div>;
}

function isTouchDevice() {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0));
}

const enumTemplates = {
    favorites: {
        _id: 'enum.favorites',
        common: {
            name: 'Favorites'
        }
    }
};

const ENUM_TEMPLATE = {
    type: 'enum',
    common: {
        name: '',
        enabled: true,
        color: false,
        desc: '',
        members: []
    },
    native: {},
};

class EnumsList extends Component {
    constructor(props) {
        super(props);

        let enumsClosed = {};
        try {
            enumsClosed = window.localStorage.getItem('enumsClosed') ? JSON.parse(window.localStorage.getItem('enumsClosed')) : {};
        } catch (e) {

        }

        this.state = {
            enums: null,
            enumsTree: null,
            selectedTab: null,
            currentCategory: window.localStorage.getItem('enumCurrentCategory') || '',
            search: '',
            enumEditDialog: null,
            enumTemplateDialog: null,
            enumEditDialogNew: false,
            enumDeleteDialog: null,
            members: {},
            categoryPopoverOpen: false,
            enumPopoverOpen: false,
            enumsClosed,
        };
    }

    getEnumTemplate = prefix => {
        let enumTemplate = JSON.parse(JSON.stringify(ENUM_TEMPLATE));
        const {_id, name} = EnumsList.findNewUniqueName(prefix, Object.values(this.state.enums), this.props.t('Enum'));
        enumTemplate._id = _id;
        enumTemplate.common.name = name;
        return enumTemplate;
    }

    createEnumTemplate = (prefix, templateValues) => {
        let enumTemplate = this.getEnumTemplate(prefix);
        enumTemplate._id = templateValues._id;
        enumTemplate.common = {...enumTemplate.common, ...templateValues.common};
        this.props.socket.setObject(enumTemplate._id, enumTemplate)
            .then(() => {
                this.updateData();

                const newId = enumTemplate._id;
                // check that parent is opened
                let parts = newId.split('.');
                parts.pop();
                let changed = false;
                const enumsClosed = JSON.parse(JSON.stringify(this.state.enumsClosed));

                while (parts.length > 2) {
                    const parentId = parts.join('.');
                    if (enumsClosed[parentId]) {
                        delete enumsClosed[parentId];
                        changed = true;
                    }
                    parts = parentId.split('.');
                    parts.pop();
                }

                if (changed) {
                    this.setState({enumsClosed}, () => {
                        setTimeout(() => {
                            const el = document.getElementById(newId);
                            if (el) {
                                el.scrollIntoView(true);
                            }
                        }, 300);
                    });
                } else {
                    setTimeout(() => {
                        const el = document.getElementById(newId);
                        if (el) {
                            el.scrollIntoView(true);
                        }
                    }, 300);
                }
            });
    }

    componentDidMount() {
        this.updateData();
    }

    updateData = async () => {
        const enums = await this.props.socket.getForeignObjects('enum.*', 'enum');
        const members = {}
        for (let enumKey in enums) {
            if (enums[enumKey].common?.members) {
                for (let memberKey in enums[enumKey].common.members) {
                    let member = enums[enumKey].common.members[memberKey];
                    if (!members[member]) {
                        try {
                            members[member] = await this.props.socket.getObject(member);
                        } catch (e) {
                            window.alert('Cannot read member "' + member + '"');
                        }
                    }
                }
            }
        }

        this.setState({enums: enums, members: members});
        this.createTree(enums);
    }

    createTree(enums) {
        let enumsTree = {
            data: null,
            children: {},
            id: ''
        };

        for (let i in enums) {
            let id = enums[i]._id;
            let currentEnum = enums[i];
            let idParts = id.split('.');
            let currentContainer = enumsTree;
            let currentParts = [];
            for (let i2 in idParts) {
                let currentPart = idParts[i2]
                currentParts.push(currentPart);
                if (!currentContainer.children[currentPart]) {
                    currentContainer.children[currentPart] = {
                        data: null,
                        children: {},
                        id: currentParts.join('.')
                    };
                }
                currentContainer = currentContainer.children[currentPart];
            }
            currentContainer.data = currentEnum;
        }
        this.setCurrentCategory(this.state.currentCategory && enumsTree.children.enum.children[this.state.currentCategory] ? this.state.currentCategory : Object.keys(enumsTree.children.enum.children)[0]);
        this.setState({enumsTree});
    }

    setCurrentCategory = category => {
        if (category !== this.state.currentCategory) {
            this.setState({currentCategory: category});
            window.localStorage.setItem('enumCurrentCategory', category);
        }
    }

    addItemToEnum = (itemId, enumId) => {
        let enumItem = JSON.parse(JSON.stringify(Object.values(this.state.enums).find(enumItem => enumItem._id === enumId)));
        if (!enumItem.common?.members) {
            enumItem.common = enumItem.common || {};
            enumItem.common.members = [];
        }
        let members = enumItem.common.members;
        if (!members.includes(itemId)) {
            members.push(itemId);
            this.props.socket.setObject(enumItem._id, enumItem).then(() => {
                this.updateData();

            });
        }
    }

    moveEnum = (fromId, toId) => {
        if (toId.startsWith(fromId)) {
            return;
        }
        let fromPrefix = fromId.split('.');
        fromPrefix.pop();
        fromPrefix = fromPrefix.join('.');
        let toPrefix = toId;
        if (fromPrefix === toPrefix) {
            return;
        }
        Promise.all(Object.keys(this.state.enums).map(async id => {
            let enumItem = this.state.enums[id];
            if (id.startsWith(fromId)) {
                let newId = id.replace(fromPrefix, toPrefix);
                let newEnum = JSON.parse(JSON.stringify(enumItem));
                newEnum._id = newId;
                return this.props.socket.setObject(newId, enumItem).then(
                    this.props.socket.delObject(id)
                );
            }
        })).then(() => this.updateData())
    }

    removeMemberFromEnum = (memberId, enumId) => {
        let enumItem = this.state.enums[enumId];
        let members = enumItem.common.members;
        if (members.includes(memberId)) {
            members.splice(members.indexOf(memberId), 1);

            this.props.socket.setObject(enumItem._id, enumItem).then(() =>
                this.updateData());
        }
    }

    renderTree(container, key, level) {
        return <div style={{paddingLeft: level ? 32 : 0}} key={container.data ? container.data._id : key }>
            {container.data && (!this.state.search || container.data._id.toLowerCase().includes(this.state.search.toLowerCase())) ?
                <EnumBlock
                    enum={container.data}
                    members={this.state.members}
                    moveEnum={this.moveEnum}
                    removeMemberFromEnum={this.removeMemberFromEnum}
                    showEnumEditDialog={this.showEnumEditDialog}
                    showEnumDeleteDialog={this.showEnumDeleteDialog}
                    showEnumTemplateDialog={this.showEnumTemplateDialog}
                    currentCategory={this.state.currentCategory}
                    getEnumTemplate={this.getEnumTemplate}
                    copyEnum={this.copyEnum}
                    key={container.data._id}
                    getName={this.getName}
                    hasChildren={!!Object.values(container.children).length}
                    closed={this.state.enumsClosed[container.data._id]}
                    toggleEnum={this.toggleEnum}

                    t={this.props.t}
                    socket={this.props.socket}
                    lang={this.props.lang}
                    classesParent={this.props.classes}
                />
                : null
            }
            {container.data && !this.state.enumsClosed[container.data._id] ?
                Object.values(container.children)
                    .map((item, index) => <React.Fragment key={index}>{this.renderTree(item, index, level + 1)}</React.Fragment>)
            : null}
        </div>;
    }

    showEnumEditDialog = (enumItem, isNew) => {
        enumItem = JSON.parse(JSON.stringify(enumItem));
        this.setState({enumEditDialog: enumItem, enumEditDialogNew: isNew});
    }

    showEnumTemplateDialog = prefix =>
        this.setState({enumTemplateDialog: prefix});

    showEnumDeleteDialog = enumItem =>
        this.setState({enumDeleteDialog: enumItem});

    saveEnum = originalId => {
        let enumItem = JSON.parse(JSON.stringify(this.state.enumEditDialog));
        let newId = this.state.enumEditDialog._id;

        this.props.socket.setObject(enumItem._id, enumItem)
            .then(() => {
                if (originalId && originalId !== this.state.enumEditDialog._id) {
                    return this.props.socket.delObject(originalId);
                }
            })
            .then(() => {
                return Promise.all(Object.values(this.state.enums).map(enumChild => {
                    if (enumChild._id.startsWith(originalId + '.')) {
                        let newEnumChild = JSON.parse(JSON.stringify(enumChild));
                        newEnumChild._id = newEnumChild._id.replace(originalId + '.', enumItem._id + '.');

                        return this.props.socket.setObject(newEnumChild._id, newEnumChild).then(() =>
                            this.props.socket.delObject(enumChild._id));
                    } else {
                        return null;
                    }
                }))
            })
            .then(() => {
                const wasNew = this.state.enumEditDialogNew;
                this.updateData();
                const newState = {enumEditDialog: null, enumEditDialogNew: false}

                if (wasNew) {
                    // check that parent is opened
                    let parts = this.state.enumEditDialog._id.split('.');
                    parts.pop();
                    let changed = false;
                    const enumsClosed = JSON.parse(JSON.stringify(this.state.enumsClosed));

                    while (parts.length > 2) {
                        const parentId = parts.join('.');
                        if (enumsClosed[parentId]) {
                            delete enumsClosed[parentId];
                            changed = true;
                        }
                        parts = parentId.split('.');
                        parts.pop();
                    }

                    if (changed) {
                        newState.enumsClosed = enumsClosed;
                    }
                }

                this.setState(newState, () => {
                    wasNew && setTimeout(() => {
                        const el = document.getElementById(newId);
                        if (el) {
                            el.scrollIntoView(true);
                        }
                    }, 300);
                });
            });
    }

    deleteEnum = (enumId) => {
        this.props.socket.delObject(enumId)
        .then(() =>
            Promise.all(Object.values(this.state.enums).map(enumChild => {
                if (enumChild._id.startsWith(enumId + '.')) {
                    return this.props.socket.delObject(enumChild._id);
                } else {
                    return null;
                }
            })))
        .then(() => {
            this.updateData();
            this.setState({enumDeleteDialog: null});
        });
    }

    copyEnum = enumId => {
        let enumItem = JSON.parse(JSON.stringify(this.state.enums[enumId]));
        let newId;
        let index = 1;
        do {
            newId = enumId + index.toString();
            index++;
        } while (this.state.enums[newId]);

        enumItem._id = newId;
        this.props.socket.setObject(newId, enumItem).then(() => this.updateData());
    }

    toggleEnum = enumId => {
        let enumsClosed = JSON.parse(JSON.stringify(this.state.enumsClosed));
        enumsClosed[enumId] = !enumsClosed[enumId];
        this.setState({enumsClosed});
        window.localStorage.setItem('enumsClosed', JSON.stringify(enumsClosed));
    }

    changeEnumFormData = enumItem => {
        const enumChanged = JSON.stringify(enumItem) !== JSON.stringify(this.state.enums[enumItem._id] || {});
        this.setState({enumEditDialog: enumItem, enumChanged});
    }

    getName = name =>
        typeof(name) === 'object' ? name[this.props.lang] || name.en : name;

    static _isUniqueName(prefix, list, word, i) {
        return !list.find(item =>
            item._id === (`${prefix}.${word.toLowerCase()}_${i}`));
    }
    static findNewUniqueName(prefix, list, word) {
        let i = 1;
        while (!EnumsList._isUniqueName(prefix, list,  word, i)) {
            i++;
        }
        return {_id: `${prefix}.${word.toLowerCase()}_${i}`, name: word + ' ' + i};
    }

    render() {
        if (!this.state.enumsTree) {
            return <LinearProgress />;
        }
        return <>
            <DndProvider backend={isTouchDevice() ? TouchBackend : HTML5Backend}>
                <DndPreview />
                <Grid container spacing={2} className={this.props.classes.mainGridCont}>
                    <Grid item xs={12} md={6} className={clsx(this.props.classes.childGridCont, this.state.innerWidth > 600 && this.props.classes.childGridContWide)}>
                    <div className={this.props.classes.topPanel}>
                        <IconButton
                            size="small"
                            className={this.props.classes.toolbarButton}
                            onClick={() =>
                                this.state.enumsTree.children.enum.children['favorites'] ?
                                    this.showEnumEditDialog(this.getEnumTemplate('enum'), true)
                                    :
                                    this.setState({categoryPopoverOpen: true})
                            }
                        >
                            <Tooltip title={this.props.t('Add enum')} placement="top">
                                <AddIcon/>
                            </Tooltip>
                        </IconButton>
                        <Popover
                            open={this.state.categoryPopoverOpen}
                            onClose={() => this.setState({categoryPopoverOpen: false})}
                            anchorEl={() => document.getElementById('categoryPopoverButton')}
                            anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                        >
                            <MenuList>
                                {this.state.enumsTree.children.enum.children['favorites'] ? null :
                                    <MenuItem onClick={() => this.createEnumTemplate('enum', enumTemplates.favorites)}>
                                        {this.props.t('Favorites')}
                                    </MenuItem>
                                }
                                <MenuItem onClick={() => this.showEnumEditDialog(this.getEnumTemplate('enum'), true)}>
                                    {this.props.t('Custom enum')}
                                </MenuItem>
                            </MenuList>
                        </Popover>
                        <Tabs
                            value={this.state.currentCategory}
                            variant="scrollable"
                            scrollButtons="auto"
                            onChange={(e, newTab) => this.setCurrentCategory(newTab)}
                        >
                            {Object.keys(this.state.enumsTree.children.enum.children).map((category, index) => {
                                let categoryData = this.state.enumsTree.children.enum.children[category].data;
                                categoryData = categoryData || {
                                    _id: this.state.enumsTree.children.enum.children[category].id,
                                    common: {
                                        name: this.state.enumsTree.children.enum.children[category].id.split('.').pop()
                                    }
                                };
                                return <Tab
                                    key={index}
                                    component={'span'}
                                    style={{backgroundColor: categoryData.common?.color || undefined, borderRadius: 4}}
                                    label={<CategoryLabel
                                        categoryData={categoryData}
                                        showEnumEditDialog={this.showEnumEditDialog}
                                        showEnumDeleteDialog={this.showEnumDeleteDialog}
                                        {...this.props}
                                    />}
                                    value={category}
                                />;
                            })}
                        </Tabs>
                    </div>
                        <div className={this.props.classes.topPanel2}>
                            <TextField
                                value={this.state.search}
                                placeholder={this.props.t('Filter')}
                                InputLabelProps={{shrink: true}}
                                className={this.props.classes.filter}
                                onChange={e => this.setState({search: e.target.value})}
                            />
                            <Tooltip title={this.props.t('Collapse all')} placement="top">
                                <IconButton
                                    //size="small"
                                    className={this.props.classes.toolbarButton}
                                    onClick={() => {
                                        let enumsClosed = {};
                                        Object.keys(this.state.enums).forEach(id => enumsClosed[id] = true);
                                        this.setState({enumsClosed});
                                        window.localStorage.setItem('enumsClosed', JSON.stringify(enumsClosed));
                                    }}
                                >
                                        <IconCollapsed/>
                                </IconButton>
                            </Tooltip>
                            <Tooltip title={this.props.t('Expand all')} placement="top">
                                <IconButton
                                    //size="small"
                                    className={this.props.classes.toolbarButton}
                                    onClick={() => {
                                        let enumsClosed = {};
                                        this.setState({enumsClosed});
                                        window.localStorage.setItem('enumsClosed', JSON.stringify(enumsClosed));
                                    }}
                                >
                                    <IconExpanded/>
                                </IconButton>
                            </Tooltip>
                            <Tooltip title={this.props.t('Add group')} placement="top">
                                <IconButton
                                    //size="small"
                                    onClick={() => {
                                        if (['functions', 'rooms'].includes(this.state.currentCategory)) {
                                            this.setState({enumTemplateDialog: 'enum.' + this.state.currentCategory});
                                        } else {
                                            this.showEnumEditDialog(this.getEnumTemplate('enum.' + this.state.currentCategory), true);
                                        }
                                    }}
                                >
                                    <AddIcon/>
                                </IconButton>
                            </Tooltip>
                        </div>
                        <div className={this.props.classes.blocksContainer}>
                            {Object.values(this.state.enumsTree.children.enum.children[this.state.currentCategory].children)
                                .map((enumItem, index) => this.renderTree(enumItem, index, 0))}
                        </div>
                    </Grid>
                    <Grid item xs={12} md={6} className={clsx(this.props.classes.childGridCont, this.state.innerWidth > 600 && this.props.classes.childGridContWide)}>
                        <div className={this.props.classes.blocksContainer}>
                            <DragObjectBrowser
                                addItemToEnum={this.addItemToEnum}
                                getName={this.getName}
                                classesParent={this.props.classes}
                                t={this.props.t}
                                socket={this.props.socket}
                                lang={this.props.lang}
                            />
                        </div>
                    </Grid>
                </Grid>
            </DndProvider>
            {this.state.enumEditDialog ? <EnumEditDialog
                onClose={() => this.setState({enumEditDialog: null})}
                enums={Object.values(this.state.enums)}
                enum={this.state.enumEditDialog}
                getName={this.getName}
                isNew={this.state.enumEditDialogNew}
                t={this.props.t}
                lang={this.props.lang}
                classesParent={this.props.classes}
                changed={this.state.enumChanged}
                onChange={this.changeEnumFormData}
                saveData={this.saveEnum}
            /> : null}
            <EnumDeleteDialog
                open={!!this.state.enumDeleteDialog}
                onClose={() => this.setState({enumDeleteDialog: null})}
                enum={this.state.enumDeleteDialog}
                getName={this.getName}
                t={this.props.t}
                classes={this.props.classes}
                deleteEnum={this.deleteEnum}
            />
            {!!this.state.enumTemplateDialog && <EnumTemplateDialog
                prefix={this.state.enumTemplateDialog}
                onClose={() => this.setState({enumTemplateDialog: null})}
                t={this.props.t}
                lang={this.props.lang}
                classesParent={this.props.classes}
                createEnumTemplate={this.createEnumTemplate}
                showEnumEditDialog={this.showEnumEditDialog}
                enums={this.state.enums}
                getEnumTemplate={this.getEnumTemplate}
            />}
        </>;
    }
}

EnumsList.propTypes = {
    t: PropTypes.func,
    lang: PropTypes.string,
    socket: PropTypes.object,
    ready: PropTypes.bool,
    expertMode: PropTypes.bool,
};

export default withStyles(styles)(EnumsList);