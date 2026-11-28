import React from 'react';
import {createRoot} from 'react-dom/client';
import {AdventurePreview} from './adventure/AdventurePreview';
import './styles.css';
createRoot(document.getElementById('root')!).render(<AdventurePreview/>);
